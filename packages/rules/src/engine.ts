import type { Facts, RuleResult } from '@pixelpeeper/schema';
import { RULES, RULES_VERSION } from './library';
import type { Rule, Scope } from './types';

export interface EvaluateOptions {
  scope?: Scope;
  rules?: Rule[];
}

/**
 * Run every rule for the scope. Threshold rules are decided here (label: measured).
 * Judgment rules are never decided here; they come back as `needs-judgment` (label: inferred)
 * for the model to answer with the listed evidence.
 */
export function evaluate(facts: Facts, { scope = 'element', rules = RULES }: EvaluateOptions = {}): RuleResult[] {
  return rules
    .filter((r) => r.scopes.includes(scope))
    .map((rule): RuleResult => {
      const base = {
        ruleId: rule.id,
        ruleVersion: `${RULES_VERSION}/${rule.version}`,
        name: rule.name,
        conformance: rule.conformance,
        criterion: rule.criterion,
        evidence: rule.evidence,
      };
      if (rule.kind === 'judgment') {
        if (rule.appliesTo && !rule.appliesTo(facts)) {
          return { ...base, label: 'inferred', status: 'not-applicable', message: 'Preconditions not met.' };
        }
        return { ...base, label: 'inferred', status: 'needs-judgment', message: rule.question };
      }
      try {
        const outcome = rule.check(facts);
        return { ...base, label: 'measured', ...outcome, evidence: outcome.evidence ?? rule.evidence };
      } catch (err) {
        return { ...base, label: 'measured', status: 'cannot-measure', message: `Rule failed to run: ${(err as Error).message}` };
      }
    });
}

/** Results worth showing on a card: decided or observed threshold results. */
export const measuredResults = (results: RuleResult[]) =>
  results.filter((r) => r.label === 'measured' && r.status !== 'not-applicable');

/** Judgment rules for the model prompt. */
export const judgmentQueue = (results: RuleResult[]) => results.filter((r) => r.status === 'needs-judgment');
