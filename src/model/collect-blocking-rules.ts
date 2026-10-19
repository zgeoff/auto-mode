import type { DecisionRule } from '../types.ts';
import type { DecisionAnswer, DecisionRequest, DecisionResult } from './types.ts';

interface BlockingRule {
  readonly id: string;
  readonly rule: DecisionRule;
  readonly answer: DecisionAnswer;
}

const TIER_ORDER: Readonly<Record<DecisionRule['tier'], number>> = { hard: 0, soft: 1 };

export function collectBlockingRules(
  request: DecisionRequest,
  result: DecisionResult,
  blockThreshold: number,
): BlockingRule[] {
  const entries = Object.entries(request.rules).map(([id, rule]) => {
    const answer = result.answers[id];

    if (answer === undefined) {
      throw new Error('Decision answer missing');
    }

    return { id, rule, answer };
  });

  return entries
    .filter((entry) => entry.answer.probabilities.block >= blockThreshold)
    .toSorted(
      (left, right) =>
        right.answer.probabilities.block - left.answer.probabilities.block ||
        TIER_ORDER[left.rule.tier] - TIER_ORDER[right.rule.tier],
    );
}
