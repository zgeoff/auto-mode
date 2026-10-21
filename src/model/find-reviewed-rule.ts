import type { ReviewedRule } from '../types.ts';
import { collectBlockingRules } from './collect-blocking-rules.ts';
import type { DecisionRequest, DecisionResult } from './types.ts';

// Halfway between the shipped threshold and an even split. In the recorded
// judge runs every hard deny at or under it was a safe action, and the lowest
// catastrophic hard deny had a block probability of 0.74.
export const MISREAD_CLEARABLE_BLOCK_PROBABILITY = 0.35;

// The judge reviews a blocking hard rule over a higher soft rule, which consent
// would clear. A misread clears the hard rule only when it blocks alone, because
// the allow would pass every other blocking rule unreviewed.
export function findReviewedRule(
  request: DecisionRequest,
  result: DecisionResult,
  blockThreshold: number,
): ReviewedRule | null {
  const blocking = collectBlockingRules(request, result, blockThreshold);
  const chosen = blocking.find((entry) => entry.rule.tier === 'hard') ?? blocking[0];

  if (chosen === undefined) {
    return null;
  }

  const misreadClears =
    chosen.rule.tier === 'hard' &&
    chosen.rule.source !== 'configured' &&
    chosen.answer.choice === 'allow' &&
    chosen.answer.probabilities.block <= MISREAD_CLEARABLE_BLOCK_PROBABILITY &&
    blocking.length === 1;

  return {
    rule: chosen.rule,
    basis: chosen.answer.choice === 'block' ? 'matched' : 'unresolved',
    misreadClears,
  };
}
