import type { Facts, RuleConformance, RuleResult } from '@pixelpeeper/schema';

export type Scope = 'element' | 'page';

interface RuleBase {
  id: string;
  /** Bump when the check, threshold or wording changes; results record it. */
  version: string;
  name: string;
  conformance: RuleConformance;
  criterion: string;
  source: { title: string; url?: string };
  scopes: Scope[];
  /** Fact paths this rule reads; shown as evidence. */
  evidence: string[];
}

/** What a check returns; the engine fills in id, version, label and criterion. */
export type CheckOutcome = Pick<RuleResult, 'status' | 'message'> &
  Partial<Pick<RuleResult, 'actual' | 'threshold' | 'unevaluatedExceptions' | 'evidence'>>;

/** Deterministic. Same Facts in, same result out. Label: measured. */
export interface ThresholdRule extends RuleBase {
  kind: 'threshold';
  check: (facts: Facts) => CheckOutcome;
}

/**
 * Needs interpretation. The engine never decides these; it hands the model the question
 * and the evidence. Label: inferred.
 */
export interface JudgmentRule extends RuleBase {
  kind: 'judgment';
  /** Short summary of the law/heuristic for the model and for vocabulary chips. */
  summary: string;
  /** The question the model must answer, citing the evidence paths. */
  question: string;
  appliesTo?: (facts: Facts) => boolean;
}

export type Rule = ThresholdRule | JudgmentRule;
