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
    // Raw size only; pass/fail against a criterion belongs to packages/rules.
    tapTarget: fact(z.object({ width: z.number(), height: z.number() })),
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
 * Outcome of one rule against one Facts snapshot.
 * - pass / fail: a threshold rule that applied and could be measured (label: measured)
 * - observed: a measured observation with no pass/fail, e.g. spacing grid (label: measured)
 * - not-applicable: the rule's preconditions are not met
 * - cannot-measure: it applies, but an input is unavailable; never guessed
 * - needs-judgment: a judgment rule handed to the model (label: inferred)
 */
export const RuleStatus = z.enum(['pass', 'fail', 'observed', 'not-applicable', 'cannot-measure', 'needs-judgment']);
export type RuleStatus = z.infer<typeof RuleStatus>;

export const RuleConformance = z.enum(['wcag-a', 'wcag-aa', 'wcag-aaa', 'guideline', 'law', 'heuristic']);
export type RuleConformance = z.infer<typeof RuleConformance>;

export const RuleResult = z.object({
  ruleId: z.string(),
  ruleVersion: z.string(),
  name: z.string(),
  label: Label,
  status: RuleStatus,
  conformance: RuleConformance,
  /** Human-readable criterion, e.g. "WCAG 2.2 SC 1.4.3 Contrast (Minimum)". */
  criterion: z.string(),
  message: z.string(),
  evidence: z.array(z.string()),
  actual: z.union([z.number(), z.string()]).optional(),
  threshold: z.union([z.number(), z.string()]).optional(),
  /** Exceptions the rule defines but the engine did not evaluate. */
  unevaluatedExceptions: z.array(z.string()).optional(),
});
export type RuleResult = z.infer<typeof RuleResult>;

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
  /** Grounded only in the screenshot; no measured fact backs it. */
  visualOnly: z.boolean().optional(),
  /** Short heading for the claim, e.g. "Repeats across plans". */
  title: z.string().optional(),
  /** Category from a fixed set: attention technique, or a law's stance (supports/strains/mixed). */
  tag: z.string().optional(),
});
export type Claim = z.infer<typeof Claim>;

export const Term = z.object({ term: z.string(), meaning: z.string() });
export type Term = z.infer<typeof Term>;

/**
 * The interpretation layer. Every claim here is `inferred`; measured values live in Facts
 * and RuleResult and are rendered from there, never from model text.
 */
export const Analysis = z.object({
  version: z.literal(2),
  scope: z.enum(['element', 'page']),
  /** The one lesson to read first. */
  headline: Claim.nullable(),
  /** What it is; `title` is a 2-4 word label. */
  role: Claim.nullable(),
  /** How it gains attention; `tag` is the technique. */
  technique: Claim.nullable(),
  works: z.array(Claim),
  watch: z.array(Claim),
  /** `title` reads "X over Y". */
  tradeoff: Claim.nullable(),
  /** Reusable takeaways, written as instructions. */
  steal: z.array(Claim),
  /** Judgment-rule readings; `ruleId` and `tag` (stance) set. */
  laws: z.array(Claim),
  visualOnly: z.array(Claim),
  vocabulary: z.array(Term),
  /** Model claims the validator removed, kept for transparency and evals. */
  rejected: z.array(z.object({ text: z.string(), reason: z.string() })),
  modelInfo: z.object({ provider: z.string(), model: z.string() }),
  rulesLibraryVersion: z.string(),
  createdAt: z.string(),
});
export type Analysis = z.infer<typeof Analysis>;

/**
 * Accept an analysis saved by any release. Version 1 (paragraph sections) is mapped onto the
 * version 2 slots so older saved ideas still open. Returns null for anything unrecognised.
 */
export function normalizeAnalysis(input: unknown): Analysis | null {
  if (!input || typeof input !== 'object') return null;
  const a = input as Record<string, unknown>;
  if (a.version === 2) { const parsed = Analysis.safeParse(a); return parsed.success ? parsed.data : null; }
  if (!a.modelInfo || !('lesson' in a)) return null; // not a v1 analysis either
  const list = (v: unknown) => (Array.isArray(v) ? (v as Claim[]) : []);
  const one = (v: unknown) => (v && typeof v === 'object' ? (v as Claim) : null);
  const legacy = {
    version: 2 as const,
    scope: a.scope === 'page' ? 'page' as const : 'element' as const,
    headline: one(a.lesson),
    role: one(a.role),
    technique: one(a.emphasis),
    works: list(a.whyItWorks),
    watch: list(a.limitations),
    tradeoff: list(a.tradeoffs)[0] ?? null,
    steal: [],
    laws: list(a.lawReadings),
    visualOnly: list(a.visualOnly),
    vocabulary: (Array.isArray(a.vocabulary) ? a.vocabulary : []).map((v) => (typeof v === 'string' ? { term: v, meaning: '' } : v)),
    rejected: list(a.rejected) as unknown as Analysis['rejected'],
    modelInfo: (a.modelInfo as Analysis['modelInfo']) ?? { provider: 'unknown', model: 'unknown' },
    rulesLibraryVersion: String(a.rulesLibraryVersion ?? 'unknown'),
    createdAt: String(a.createdAt ?? new Date(0).toISOString()),
  };
  const parsed = Analysis.safeParse(legacy);
  return parsed.success ? parsed.data : null;
}

/** Resolve a dotted path like "typography.fontSize" against a Facts object. */
export function getFact(facts: Facts, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => (acc as Record<string, unknown> | undefined)?.[key], facts);
}
