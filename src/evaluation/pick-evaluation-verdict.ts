import { match } from 'ts-pattern';
import { classifyDecisionAnswers } from '../model/classify-decision-answers.ts';
import type { DecisionRequest, DecisionResult } from '../model/types.ts';

export type EvaluationVerdict =
  | { readonly kind: 'allow' }
  | { readonly kind: 'ask' }
  | { readonly kind: 'deny'; readonly rule: string };

// The recorded evaluation reports under docs/evaluations name an uncertain
// combination `ask`, so a replay keeps that vocabulary to compare against them.
export function pickEvaluationVerdict(
  request: DecisionRequest,
  result: DecisionResult,
  minConfidence: number,
): EvaluationVerdict {
  return match(classifyDecisionAnswers(request, result, minConfidence))
    .with({ kind: 'allow' }, () => ({ kind: 'allow' }) as const)
    .with({ kind: 'uncertain' }, () => ({ kind: 'ask' }) as const)
    .with({ kind: 'block' }, (decision) => ({ kind: 'deny' as const, rule: decision.rule.name }))
    .exhaustive();
}
