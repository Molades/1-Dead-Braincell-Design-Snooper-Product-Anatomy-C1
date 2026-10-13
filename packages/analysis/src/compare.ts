import * as z from 'zod/v4';
import { evaluate } from '@pixelpeeper/rules';
import type { Analysis, Claim, Facts, Insight, Level, RuleResult } from '@pixelpeeper/schema';
import { AUDIENCE, compactFacts } from './prompt';
import { structuredCall, type StructuredOptions } from './structured';
import { allowedNumbers, factPaths, matchesMeasured, numbersInText } from './validate';

/** Comparing 2–3 ideas, and drafting a rationale for a direction built from them. */

export const LETTERS = ['A', 'B', 'C'] as const;
type Letter = (typeof LETTERS)[number];

const Evidence = z.array(z.string()).describe('Evidence as "<letter>:<fact path>", e.g. "A:typography.fontSize", "B:color.contrast", "C:rule:<ruleId>".');
const Detail = z.string().describe('One plain sentence, max 30 words.');
const Point = z.object({ title: z.string().describe('Max 6 words, no numbers.'), detail: Detail, evidence: Evidence });

export const ReadAcrossOutput = z.object({
  differences: z.array(Point).describe('2-4 differences that explain why these ideas feel different. Compare across ideas; do not describe each one alone.'),
  bestFor: z.array(z.object({ item: z.enum(LETTERS), goal: z.string().describe('Max 8 words, e.g. "calm marketing pages".'), detail: Detail, evidence: Evidence })).describe('0-3 hedged notes on which idea suits which kind of use. Never a single winner.'),
});
export const RationaleOutput = z.object({
  rationale: z.array(Point).describe('2-4 points on how the chosen values work together, and any tension between them.'),
});

const RULES = `Rules for every claim:
- Everything you write is an inference. Hedge where appropriate.
- Cite evidence as "<letter>:<path>" using the letters given, with paths exactly as in that idea's FACTS, or "<letter>:rule:<ruleId>" for its measured rule results.
- Do not state any number that is not present in the data given. Do not estimate from memory.
- Never restate or contradict a pass/fail; do not declare a winner.
- Short, specific sentences for a designer who is learning.`;

export const COMPARE_SYSTEM = `You are Pixel Peeper's design teacher, comparing two or three design references a learner saved from live websites.
Each idea has measured FACTS (ground truth), measured rule results, and its earlier lesson (inferred, context only).
Explain why they feel different and what each is good for.
${RULES}`;

export const RATIONALE_SYSTEM = `You are Pixel Peeper's design teacher. A learner is building a design direction by borrowing values from two or three saved references.
You receive each idea's measured FACTS, the learner's choices, and a contrast check recomputed for the new combination.
Explain how the chosen values work together, and name any tension (for example a new text and background pairing that fails contrast).
${RULES}`;

export interface CompareItem {
  facts: Facts;
  scope: 'element' | 'page';
  pattern: string;
  site: string;
  page: string;
  analysis: Analysis | null;
}

function ideaBlock(item: CompareItem, letter: Letter, results: RuleResult[]): string {
  const measured = results.filter((r) => r.label === 'measured' && r.status !== 'not-applicable').map((r) => ({ ruleId: r.ruleId, status: r.status, message: r.message }));
  const a = item.analysis;
  const lesson = a ? [a.headline?.text, ...a.works.map((c) => c.title ?? c.text), ...a.watch.map((c) => c.title ?? c.text)].filter(Boolean) : [];
  return [
    `IDEA ${letter} — ${item.pattern} — ${item.site} · ${item.page}`,
    `FACTS: ${JSON.stringify(compactFacts(item.facts))}`,
    `MEASURED RULE RESULTS: ${JSON.stringify(measured)}`,
    lesson.length ? `EARLIER LESSON (inferred, context only): ${JSON.stringify(lesson)}` : '',
  ].filter(Boolean).join('\n');
}

export interface CompareOptions extends Pick<StructuredOptions<z.ZodType>, 'provider' | 'apiKey' | 'model' | 'signal' | 'client' | 'fetch'> {
  items: CompareItem[];
  mode: 'readAcross' | 'rationale';
  /** rationale mode: the learner's choices and the recomputed contrast, as plain lines. */
  direction?: string;
  /** Numbers computed for the direction (e.g. recomputed contrast) that claims may cite. */
  extraNumbers?: number[];
  audience?: Level;
}

/**
 * Trust boundary for comparisons: evidence must name a letter in range and a path measured for
 * that idea; numbers must appear in some idea's measurements (or the recomputed direction).
 */
export function validateInsight(
  kind: Insight['kind'],
  points: { title: string; detail: string; evidence: string[]; item?: Letter; goal?: string }[],
  bestFor: { item: Letter; goal: string; detail: string; evidence: string[] }[],
  items: CompareItem[],
  ctx: { provider: string; model: string; extraNumbers?: number[] },
): Insight {
  const perItem = items.map((it) => {
    const results = evaluate(it.facts, { scope: it.scope });
    return {
      paths: factPaths(it.facts),
      rules: new Set(results.filter((r) => r.label === 'measured' && r.status !== 'not-applicable').map((r) => `rule:${r.ruleId}`)),
      numbers: allowedNumbers(it.facts, results),
    };
  });
  const numbers = [...perItem.flatMap((p) => p.numbers), ...(ctx.extraNumbers ?? [])];
  const ok = (x: number) => matchesMeasured(x, numbers);
  const rejected: Insight['rejected'] = [];
  let n = 0;
  const toClaim = (title: string, detail: string, evidence: string[], tag?: string): Claim | null => {
    const text = detail.trim();
    if (!text) return null;
    const bad = numbersInText(`${title} ${text}`).filter((x) => !ok(x));
    if (bad.length) { rejected.push({ text: `${title}: ${text}`, reason: `States unmeasured number(s): ${bad.join(', ')}` }); return null; }
    const valid = [...new Set(evidence.filter((e) => {
      const m = e.match(/^([ABC]):(.+)$/);
      const i = m ? LETTERS.indexOf(m[1] as Letter) : -1;
      return i >= 0 && i < items.length && (perItem[i]!.paths.has(m![2]!) || perItem[i]!.rules.has(m![2]!));
    }))];
    if (!valid.length) { rejected.push({ text: `${title}: ${text}`, reason: 'Cites no measured evidence' }); return null; }
    return { id: `k${++n}`, title: title.trim() || undefined, text, label: 'inferred', evidence: valid, ...(tag ? { tag } : {}) };
  };
  const keep = (c: Claim | null): c is Claim => c !== null;
  return {
    kind,
    claims: points.slice(0, 4).map((p) => toClaim(p.title, p.detail, p.evidence)).filter(keep),
    bestFor: bestFor
      .filter((b) => LETTERS.indexOf(b.item) < items.length)
      .slice(0, 3)
      .map((b) => toClaim(b.goal, b.detail, b.evidence, b.item))
      .filter(keep),
    rejected,
    modelInfo: { provider: ctx.provider, model: ctx.model },
    createdAt: new Date().toISOString(),
  };
}

export async function compareIdeas(o: CompareOptions): Promise<Insight> {
  if (o.items.length < 2 || o.items.length > 3) throw new Error('Compare needs two or three ideas.');
  const blocks = o.items.map((it, i) => ideaBlock(it, LETTERS[i]!, evaluate(it.facts, { scope: it.scope }))).join('\n\n');
  const user = [o.audience ? AUDIENCE[o.audience] : '', blocks, o.mode === 'rationale' ? `DIRECTION:\n${o.direction ?? ''}` : ''].filter(Boolean).join('\n\n');
  const base = { provider: o.provider, apiKey: o.apiKey, model: o.model, user, signal: o.signal, client: o.client, fetch: o.fetch, maxTokens: 4000 };
  if (o.mode === 'readAcross') {
    const { data, model } = await structuredCall({ ...base, system: COMPARE_SYSTEM, schema: ReadAcrossOutput, name: 'read_across' });
    return validateInsight('readAcross', data.differences, data.bestFor, o.items, { provider: o.provider, model, extraNumbers: o.extraNumbers });
  }
  const { data, model } = await structuredCall({ ...base, system: RATIONALE_SYSTEM, schema: RationaleOutput, name: 'direction_rationale' });
  return validateInsight('rationale', data.rationale, [], o.items, { provider: o.provider, model, extraNumbers: o.extraNumbers });
}
