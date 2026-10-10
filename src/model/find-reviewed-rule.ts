import { collectBlockingRules } from './collect-blocking-rules.ts';
import type { DeniedRule } from './find-denied-rule.ts';
import type { DecisionRequest, DecisionResult } from './types.ts';

// A hard rule never clears, so the judge reviews one whenever it blocks:
// reviewing a soft rule ranked above it would let consent clear the action.
export function findReviewedRule(
  request: DecisionRequest,
  result: DecisionResult,
  blockThreshold: number,
): DeniedRule | null {
  const blocking = collectBlockingRules(request, result, blockThreshold);
  const chosen = blocking.find((entry) => entry.rule.tier === 'hard') ?? blocking[0];

  if (chosen === undefined) {
    return null;
  }

  return {
    rule: chosen.rule,
    basis: chosen.answer.choice === 'block' ? 'matched' : 'unresolved',
  };
}
