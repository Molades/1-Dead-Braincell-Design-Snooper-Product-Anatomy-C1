import { z } from 'zod';

/** The two labels every claim in the product carries. */
export const Label = z.enum(['measured', 'inferred']);
export type Label = z.infer<typeof Label>;

/** Where a measured value came from. */
export const FactSource = z.enum(['computed', 'attribute', 'derived']);

const fact = <T extends z.ZodTypeAny>(value: T) =>
  z.object({ value, source: FactSource });

const str = fact(z.string());
const num = fact(z.number());

export const Rect = z.object({ x: z.number(), y: z.number(), width: z.number(), height: z.number() });

/** Contrast is null-valued when it cannot be measured (image/gradient background). */
export const ContrastFact = z.object({
  canMeasure: z.boolean(),
  reason: z.string().optional(),
  ratio: z.number().nullable(),
  foreground: z.string().nullable(),
  background: z.string().nullable(),
  aa: z.boolean().nullable(),
  aaa: z.boolean().nullable(),
  source: FactSource,
});
export type ContrastFact = z.infer<typeof ContrastFact>;

export const Facts = z.object({
  schemaVersion: z.literal(0),
  url: z.string(),
  capturedAt: z.string(),
  selector: z.string(),
  typography: z.object({
    fontFamily: str,
    fontSize: num,
    fontWeight: num,
    lineHeight: fact(z.number().nullable()), // px, null when "normal"
    letterSpacing: fact(z.number()), // px
    textAlign: str,
  }),
  color: z.object({
    text: str,
    background: str,
    border: str,
    opacity: num,
    contrast: ContrastFact,
  }),
  spacing: z.object({
    padding: fact(z.tuple([z.number(), z.number(), z.number(), z.number()])),
    margin: fact(z.tuple([z.number(), z.number(), z.number(), z.number()])),
    gap: fact(z.number().nullable()),
    /** Largest base (4 or 8) that divides every non-zero spacing value, else null. */
    scaleBase: fact(z.number().nullable()),
  }),
  size: z.object({
    width: num,
    height: num,
    aspectRatio: num,
    position: fact(Rect), // page coordinates
  }),
  shape: z.object({
    borderWidth: num,
    borderStyle: str,
    borderRadius: fact(z.array(z.number())),
    boxShadow: str,
    backgroundImage: str,
  }),
  layout: z.object({
    display: str,
    flexDirection: fact(z.string().nullable()),
    alignItems: fact(z.string().nullable()),
    justifyContent: fact(z.string().nullable()),
    gridTemplateColumns: fact(z.string().nullable()),
  }),
  structure: z.object({
    tag: str,
    role: fact(z.string().nullable()),
    depth: num,
    childCount: num,
    componentType: fact(z.string().nullable()),
  }),
  a11y: z.object({
    tapTarget: fact(z.object({ width: z.number(), height: z.number(), meets44: z.boolean() })),
    minTextSize: fact(z.number().nullable()),
    accessibleName: fact(z.string().nullable()),
    altText: fact(z.string().nullable()),
  }),
  consistency: z.object({
    /** How many elements on the page share this exact style fingerprint. */
    sameStyleCount: num,
  }),
});
export type Facts = z.infer<typeof Facts>;

/**
 * A single claim shown on an analysis card.
 * Trust rule: `measured` claims must reference fact ids that exist in Facts;
 * the validator (packages/analysis, later phase) downgrades violators to `inferred`.
 */
export const Claim = z.object({
  id: z.string(),
  text: z.string(),
  label: Label,
  evidence: z.array(z.string()), // dotted fact paths, e.g. "typography.fontSize"
  ruleId: z.string().optional(),
});
export type Claim = z.infer<typeof Claim>;

export const Analysis = z.object({
  scope: z.enum(['element', 'page']),
  role: Claim,
  hierarchy: Claim,
  emphasis: Claim,
  whyItWorks: z.array(Claim),
  tradeoffs: z.array(Claim),
  lawReadings: z.array(Claim),
  vocabChips: z.array(z.string()),
  modelInfo: z.object({ provider: z.string(), model: z.string() }),
  rulesLibraryVersion: z.string(),
});
export type Analysis = z.infer<typeof Analysis>;

/** Resolve a dotted path like "typography.fontSize" against a Facts object. */
export function getFact(facts: Facts, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => (acc as Record<string, unknown> | undefined)?.[key], facts);
}
