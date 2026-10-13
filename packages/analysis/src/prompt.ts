import type Anthropic from '@anthropic-ai/sdk';
import type { Facts, Level, RuleResult } from '@pixelpeeper/schema';
import { JUDGMENT_RULES, RULES_VERSION } from '@pixelpeeper/rules';

/**
 * Stable across requests for one rules version, so it can be prompt-cached.
 * Never put per-request data (URLs, timestamps, facts) in here.
 */
export function systemPrompt({ library = true }: { library?: boolean } = {}): string {
  return `You are Pixel Peeper's design teacher. A learner selected part of a live webpage. You receive:
1. A screenshot of the selection (only the visible part, if it extends beyond the viewport).
2. FACTS: computed styles measured from the page. These are ground truth.
3. MEASURED RULE RESULTS: deterministic checks already decided by code (WCAG contrast, target size, and similar).
4. JUDGMENT RULES: questions for you to answer.

Your job is interpretation only: intent, hierarchy, emphasis, why it works, where it falls short, trade-offs.

Rules for every claim:
- Every claim you write is an inference. Hedge where appropriate ("likely", "suggests").
- Cite evidence as fact paths exactly as they appear in FACTS (e.g. "typography.fontSize", "color.contrast") or as "rule:<ruleId>" for a measured rule result.
- Do not state any number that is not present in FACTS or MEASURED RULE RESULTS. Do not estimate sizes, ratios or distances from the screenshot.
- Never restate a pass/fail yourself and never contradict a measured result. If a result is "cannot-measure", do not judge it from the screenshot.
- Do not invent attention scores, conversion effects, or user research.
- Fitts's law does not imply a universal pixel threshold. Do not present 44px as a WCAG AA requirement.
- If something is visible only in the screenshot, put it in visualOnly, with no numbers.
- Write for a designer who is learning: plain, specific, short sentences. Fill the slots; do not write paragraphs.
- Titles and labels name the idea, not the number: "Generous padding", not "24px padding".
- "steal" items are instructions the learner can reuse anywhere: "Give the primary action the only dark fill in its region."
- Only include laws that clearly apply; fewer, sharper readings beat many vague ones.${library ? `

Judgment rules library (version ${RULES_VERSION}):
${JUDGMENT_RULES.map((r) => `- ${r.id} — ${r.name}: ${r.summary}`).join('\n')}` : ''}`;
}

export const SYSTEM_PROMPT = systemPrompt();
/** Shorter system prompt for token-metered providers; the judgment questions still arrive in the user turn. */
export const COMPACT_SYSTEM_PROMPT = systemPrompt({ library: false });

export interface PromptInput {
  facts: Facts;
  /** Who is reading; changes depth and tone, never the facts. */
  audience?: Level;
  results: RuleResult[];
  image: { base64: string; mediaType: 'image/png' | 'image/jpeg' };
  scope: 'element' | 'page';
}

/** Compact facts for the prompt: drop provenance noise the model does not need. */
function compactFacts(facts: Facts): unknown {
  const walk = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(walk);
    if (node && typeof node === 'object') {
      const obj = node as Record<string, unknown>;
      if ('source' in obj && 'value' in obj) return walk(obj.value);
      return Object.fromEntries(Object.entries(obj).filter(([k]) => k !== 'source').map(([k, v]) => [k, walk(v)]));
    }
    return node;
  };
  const { url: _url, capturedAt: _at, schemaVersion: _v, ...rest } = facts;
  return walk(rest);
}

/** The text half of the user turn; providers attach the screenshot their own way. */
/** Per-request reader note. Kept in the user turn so the cached system prompt stays identical. */
export const AUDIENCE: Record<Level, string> = {
  student: 'READER: a design student. Explain any design term in plain words the first time you use it. Prefer one concrete example over abstraction. Keep each sentence short.',
  practising: 'READER: a practising designer. Use standard design vocabulary without defining it. Be specific and practical.',
  senior: 'READER: a senior designer or design lead. Be terse. Lead with trade-offs, edge cases and what is unusual here. Skip definitions and obvious points.',
};

export function buildUserText({ facts, results, scope, audience }: Omit<PromptInput, 'image'>, { compact = false }: { compact?: boolean } = {}): string {
  const measured = results
    .filter((r) => r.label === 'measured' && r.status !== 'not-applicable')
    .map(({ ruleId, status, message, actual, threshold, criterion }) => (compact ? { ruleId, status, message } : { ruleId, status, message, actual, threshold, criterion }));
  const queued = results.filter((r) => r.status === 'needs-judgment').map((r) => ({ ruleId: r.ruleId, question: r.message, evidence: r.evidence }));
  return [
    ...(audience ? [AUDIENCE[audience]] : []),
    `SCOPE: ${scope}`,
    `FACTS:\n${JSON.stringify(compactFacts(facts))}`,
    `MEASURED RULE RESULTS:\n${JSON.stringify(measured)}`,
    `JUDGMENT RULES TO ANSWER:\n${JSON.stringify(queued)}`,
  ].join('\n\n');
}

export function buildUserContent(input: PromptInput): Anthropic.Beta.BetaContentBlockParam[] {
  return [
    { type: 'image', source: { type: 'base64', media_type: input.image.mediaType, data: input.image.base64 } },
    { type: 'text', text: buildUserText(input) },
  ];
}
