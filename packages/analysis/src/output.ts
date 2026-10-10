import * as z from 'zod/v4';

/**
 * What the model is allowed to return. There is deliberately no "measured" label:
 * the model only interprets. Measured values come from Facts and rule results.
 */
const Evidence = z.array(z.string()).describe('Fact paths (e.g. "typography.fontSize") or rule ids (e.g. "rule:wcag-1.4.3-contrast-minimum") this claim relies on.');
const ModelClaim = z.object({ text: z.string(), evidence: Evidence });

export const ModelOutput = z.object({
  lesson: ModelClaim.describe('One short, hedged sentence: the single most useful design lesson from this selection.'),
  role: ModelClaim.describe('Likely role or function, e.g. primary call-to-action, trust signal, pricing card.'),
  emphasis: ModelClaim.describe('How attention is created or withheld: contrast, size, isolation, color, position.'),
  whyItWorks: z.array(ModelClaim).describe('1-3 reasons the design works.'),
  limitations: z.array(ModelClaim).describe('0-3 places it falls short. Cite measured failures where they exist.'),
  tradeoffs: z.array(ModelClaim).describe('0-2 tensions it leans into (density vs clarity, focus vs variety), each tied to a measured value.'),
  lawReadings: z.array(z.object({ ruleId: z.string(), text: z.string(), evidence: Evidence })).describe('Answers to the queued judgment rules, by ruleId. Skip any you cannot answer from the evidence.'),
  visualOnly: z.array(z.object({ text: z.string() })).describe('Observations visible only in the screenshot (imagery, patterns markup does not reveal). No numbers.'),
  vocabulary: z.array(z.string()).describe('3-6 design terms a learner should attach to what is observed.'),
});
export type ModelOutput = z.infer<typeof ModelOutput>;
