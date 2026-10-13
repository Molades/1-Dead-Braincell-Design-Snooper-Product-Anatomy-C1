import * as z from 'zod/v4';

/**
 * What the model is allowed to return: short, labelled slots the UI can lay out, never free
 * paragraphs. There is deliberately no "measured" label: the model only interprets. Measured
 * values come from Facts and rule results.
 */
const Evidence = z.array(z.string()).describe('Fact paths exactly as in FACTS (e.g. "typography.fontSize") or "rule:<ruleId>".');
const Detail = z.string().describe('One plain sentence, max 25 words.');
const Point = z.object({
  title: z.string().describe('Max 6 words, no numbers. E.g. "Repeats across all plans".'),
  detail: Detail,
  evidence: Evidence,
});

export const TECHNIQUES = ['contrast', 'size', 'color', 'isolation', 'position', 'weight', 'shape', 'spacing', 'repetition', 'imagery', 'restraint'] as const;
export const STANCES = ['supports', 'strains', 'mixed'] as const;

export const ModelOutput = z.object({
  headline: z.object({ text: z.string().describe('The single most useful lesson. Max 14 words. Hedge if unsure.'), evidence: Evidence }),
  role: z.object({ label: z.string().describe('2-4 words, e.g. "Primary call-to-action".'), detail: Detail, evidence: Evidence }),
  technique: z.object({ label: z.enum(TECHNIQUES).describe('The main way it gains (or deliberately withholds) attention.'), detail: Detail, evidence: Evidence }),
  works: z.array(Point).describe('1-3 strengths.'),
  watch: z.array(Point).describe('0-3 weaknesses. Use measured failures where present.'),
  tradeoff: z
    .object({ leansToward: z.string().describe('1-3 words'), over: z.string().describe('1-3 words'), detail: Detail, evidence: Evidence })
    .nullable()
    .describe('The main tension it chooses a side of (e.g. density over clarity), or null.'),
  steal: z.array(z.object({ text: z.string().describe('An instruction the learner can reuse in their own work. Max 16 words.'), evidence: Evidence })).describe('1-2 takeaways.'),
  laws: z.array(z.object({ ruleId: z.string(), stance: z.enum(STANCES), detail: Detail, evidence: Evidence })).describe('Readings for the queued judgment rules that clearly apply. Skip the rest. Max 4.'),
  visualOnly: z.array(z.object({ text: z.string() })).describe('0-2 observations visible only in the screenshot. No numbers.'),
  vocabulary: z.array(z.object({ term: z.string(), meaning: z.string().describe('Max 12 words.') })).describe('2-5 design terms for what is observed.'),
});
export type ModelOutput = z.infer<typeof ModelOutput>;
