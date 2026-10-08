import betterleaksRules from './betterleaks-rules.json' with { type: 'json' };
import type { SecretRuleSet } from './types.ts';

// Parsing 195 KB on every CLI start costs about 8 ms; the rule-set test
// parses the file against this shape once instead.
// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- generated to this shape
const RULE_SET = betterleaksRules as SecretRuleSet;

export function getSecretRuleSet(): SecretRuleSet {
  return RULE_SET;
}
