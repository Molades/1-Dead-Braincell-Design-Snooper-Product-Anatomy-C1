import type { Analysis, Claim, Facts, RuleResult } from '@pixelpeeper/schema';
import type { ModelOutput } from './output';

/** Every leaf fact path in a Facts object (a leaf is any node carrying `source`). */
export function factPaths(facts: Facts): Set<string> {
  const out = new Set<string>();
  const walk = (node: unknown, path: string) => {
    if (!node || typeof node !== 'object' || Array.isArray(node)) return;
    const obj = node as Record<string, unknown>;
    if ('source' in obj) { out.add(path); return; }
    for (const [k, v] of Object.entries(obj)) walk(v, path ? `${path}.${k}` : k);
  };
  walk(facts, '');
  return out;
}

/** Every number present in Facts and rule results; the only numbers a claim may state. */
export function allowedNumbers(facts: Facts, results: RuleResult[]): number[] {
  const nums: number[] = [];
  const walk = (node: unknown) => {
    if (typeof node === 'number') nums.push(node);
    else if (typeof node === 'string') for (const m of node.matchAll(/-?\d+(?:\.\d+)?/g)) nums.push(parseFloat(m[0]));
    else if (Array.isArray(node)) node.forEach(walk);
    else if (node && typeof node === 'object') Object.values(node).forEach(walk);
  };
  const { url: _u, capturedAt: _c, selector: _s, ...rest } = facts;
  walk(rest);
  for (const r of results) { walk(r.actual); walk(r.threshold); walk(r.message); walk(r.criterion); }
  return nums;
}

/**
 * Numbers in prose that look like measurements: values with units, ratios, percentages,
 * multipliers. Bare small integers ("3 reasons", "Nielsen #4") are ignored.
 */
export function numbersInText(text: string): number[] {
  const out: number[] = [];
  for (const m of text.matchAll(/(-?\d+(?:\.\d+)?)\s*(px|pt|rem|em|%|:1|×|x\b|ms)/gi)) out.push(parseFloat(m[1]!));
  for (const m of text.matchAll(/\b\d+\.\d+\b/g)) out.push(parseFloat(m[0]));
  return [...new Set(out)];
}

const matches = (n: number, allowed: number[]) => allowed.some((a) => Math.abs(a - n) <= 0.5 || Math.round(a) === n);

export interface ValidateContext {
  facts: Facts;
  results: RuleResult[];
  scope: 'element' | 'page';
  model: string;
  rulesVersion: string;
  provider?: string;
}

/**
 * The trust boundary. Converts model output into labeled Claims and removes anything that
 * pretends to be measured: unknown evidence paths are dropped, claims whose numbers do not
 * appear in the measurements are rejected, and law readings must answer a queued rule.
 */
export function validate(output: ModelOutput, ctx: ValidateContext): Analysis {
  const paths = factPaths(ctx.facts);
  const ruleIds = new Set(ctx.results.filter((r) => r.label === 'measured' && r.status !== 'not-applicable').map((r) => `rule:${r.ruleId}`));
  const queued = new Set(ctx.results.filter((r) => r.status === 'needs-judgment').map((r) => r.ruleId));
  const nums = allowedNumbers(ctx.facts, ctx.results);
  const rejected: Analysis['rejected'] = [];
  let n = 0;

  const toClaim = (text: string, evidence: string[], extra: Partial<Claim> = {}): Claim | null => {
    const clean = text.trim();
    if (!clean) return null;
    const bad = numbersInText(clean).filter((x) => !matches(x, nums));
    if (bad.length) { rejected.push({ text: clean, reason: `States unmeasured number(s): ${bad.join(', ')}` }); return null; }
    const valid = [...new Set(evidence.filter((e) => paths.has(e) || ruleIds.has(e)))];
    if (!valid.length && !extra.visualOnly) { rejected.push({ text: clean, reason: 'Cites no measured evidence' }); return null; }
    return { id: `c${++n}`, text: clean, label: 'inferred', evidence: valid, ...extra };
  };
  const many = (items: { text: string; evidence: string[] }[]) =>
    items.map((c) => toClaim(c.text, c.evidence)).filter((c): c is Claim => c !== null);

  const lawReadings = output.lawReadings
    .map((l) => {
      if (!queued.has(l.ruleId)) { rejected.push({ text: l.text, reason: `Unknown or unqueued rule: ${l.ruleId}` }); return null; }
      return toClaim(l.text, l.evidence, { ruleId: l.ruleId });
    })
    .filter((c): c is Claim => c !== null);

  return {
    scope: ctx.scope,
    lesson: toClaim(output.lesson.text, output.lesson.evidence),
    role: toClaim(output.role.text, output.role.evidence),
    emphasis: toClaim(output.emphasis.text, output.emphasis.evidence),
    whyItWorks: many(output.whyItWorks),
    limitations: many(output.limitations),
    tradeoffs: many(output.tradeoffs),
    lawReadings,
    visualOnly: output.visualOnly.map((v) => toClaim(v.text, [], { visualOnly: true })).filter((c): c is Claim => c !== null),
    vocabulary: [...new Set(output.vocabulary.map((v) => v.trim()).filter(Boolean))].slice(0, 8),
    rejected,
    modelInfo: { provider: ctx.provider ?? 'anthropic', model: ctx.model },
    rulesLibraryVersion: ctx.rulesVersion,
    createdAt: new Date().toISOString(),
  };
}
