import { JUDGMENT_RULES } from './judgment';
import { THRESHOLD_RULES } from './threshold';
import type { Rule } from './types';

/** Library version. Bump on any rule addition, removal or change; stored with every analysis. */
export const RULES_VERSION = '0.1.0';

export const RULES: Rule[] = [...THRESHOLD_RULES, ...JUDGMENT_RULES];

export const ruleById = (id: string) => RULES.find((r) => r.id === id);
