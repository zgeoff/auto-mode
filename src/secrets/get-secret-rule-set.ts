import { BETTERLEAKS_RULES } from './betterleaks-rules.ts';
import type { SecretRuleSet } from './types.ts';

export function getSecretRuleSet(): SecretRuleSet {
  return BETTERLEAKS_RULES;
}
