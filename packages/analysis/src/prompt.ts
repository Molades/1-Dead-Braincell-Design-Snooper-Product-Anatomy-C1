import type Anthropic from '@anthropic-ai/sdk';
import type { Facts, RuleResult } from '@pixelpeeper/schema';
import { JUDGMENT_RULES, RULES_VERSION } from '@pixelpeeper/rules';

/**
 * Stable across requests for one rules version, so it can be prompt-cached.
 * Never put per-request data (URLs, timestamps, facts) in here.
 */
export const SYSTEM_PROMPT = `You are Pixel Peeper's design teacher. A learner selected part of a live webpage. You receive:
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
- Write for a designer who is learning: plain, specific, short sentences.

Judgment rules library (version ${RULES_VERSION}):
${JUDGMENT_RULES.map((r) => `- ${r.id} — ${r.name}: ${r.summary}`).join('\n')}`;

export interface PromptInput {
  facts: Facts;
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

export function buildUserContent({ facts, results, image, scope }: PromptInput): Anthropic.Beta.BetaContentBlockParam[] {
  const measured = results
    .filter((r) => r.label === 'measured' && r.status !== 'not-applicable')
    .map(({ ruleId, status, message, actual, threshold, criterion }) => ({ ruleId, status, message, actual, threshold, criterion }));
  const queued = results.filter((r) => r.status === 'needs-judgment').map((r) => ({ ruleId: r.ruleId, question: r.message, evidence: r.evidence }));
  return [
    { type: 'image', source: { type: 'base64', media_type: image.mediaType, data: image.base64 } },
    {
      type: 'text',
      text: [
        `SCOPE: ${scope}`,
        `FACTS:\n${JSON.stringify(compactFacts(facts))}`,
        `MEASURED RULE RESULTS:\n${JSON.stringify(measured)}`,
        `JUDGMENT RULES TO ANSWER:\n${JSON.stringify(queued)}`,
      ].join('\n\n'),
    },
  ];
}
