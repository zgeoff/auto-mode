import { classifyDecisionAnswers } from './classify-decision-answers.ts';
import type { DecisionDiagnostics, DecisionRequest, DecisionResult } from './types.ts';

export function collectDecisionContributors(
  request: DecisionRequest,
  result: DecisionResult,
  minConfidence: number,
): DecisionDiagnostics['contributors'] {
  const decision = classifyDecisionAnswers(request, result, minConfidence);

  return Object.entries(request.rules).flatMap(([id, rule]) => {
    const answer = result.answers[id];

    if (answer === undefined) {
      throw new Error('Decision answer missing');
    }

    const contributes =
      decision.kind === 'block'
        ? rule === decision.rule
        : decision.kind === 'uncertain' &&
          (answer.choice !== 'allow' ||
            answer.confidence < minConfidence ||
            answer.probabilities.allow < minConfidence);

    return contributes
      ? [
          {
            rule: rule.source === 'shipped' ? rule.name : id,
            source: rule.source,
            tier: rule.tier,
            choice: answer.choice,
            confidence: answer.confidence,
            probability: answer.probabilities[answer.choice],
          },
        ]
      : [];
  });
}
