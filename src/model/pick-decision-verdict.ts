import type { Verdict } from '../harness/types.ts';
import type { DecisionRequest, DecisionResult } from './types.ts';

export function pickDecisionVerdict(
  request: DecisionRequest,
  result: DecisionResult,
  minConfidence: number,
): Verdict {
  const entries = Object.entries(request.rules);

  for (const tier of ['hard', 'soft'] as const) {
    for (const [id, rule] of entries) {
      const answer = result.answers[id];

      if (answer === undefined) {
        throw new Error('Decision answer missing');
      }

      if (
        rule.tier === tier &&
        answer.choice === 'block' &&
        answer.confidence >= minConfidence &&
        answer.probabilities.block >= minConfidence
      ) {
        return { kind: 'deny', rule: rule.name, reason: `The action matches ${rule.name}.` };
      }
    }
  }

  for (const [id] of entries) {
    const answer = result.answers[id];

    if (answer === undefined) {
      throw new Error('Decision answer missing');
    }

    if (
      answer.choice !== 'allow' ||
      answer.confidence < minConfidence ||
      answer.probabilities.allow < minConfidence
    ) {
      return { kind: 'ask' };
    }
  }

  return { kind: 'allow' };
}
