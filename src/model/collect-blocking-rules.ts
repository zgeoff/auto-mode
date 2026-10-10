import type { DecisionAnswer, DecisionRequest, DecisionResult, DecisionRule } from './types.ts';

interface BlockingRule {
  readonly id: string;
  readonly rule: DecisionRule;
  readonly answer: DecisionAnswer;
}

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
      (a, b) =>
        b.answer.probabilities.block - a.answer.probabilities.block ||
        TIER_ORDER[a.rule.tier] - TIER_ORDER[b.rule.tier],
    );
}

const TIER_ORDER: Readonly<Record<DecisionRule['tier'], number>> = { hard: 0, soft: 1 };
