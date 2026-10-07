import { match } from 'ts-pattern';
import { buildDenyReason } from '../policy/build-deny-reason.ts';
import type { Verdict } from '../request/types.ts';
import { classifyDecisionAnswers } from './classify-decision-answers.ts';
import type { DecisionRequest, DecisionResult } from './types.ts';

export function pickDecisionVerdict(
  request: DecisionRequest,
  result: DecisionResult,
  minConfidence: number,
): Verdict {
  return match(classifyDecisionAnswers(request, result, minConfidence))
    .with({ kind: 'allow' }, () => ({ kind: 'allow' }) as const)
    .with({ kind: 'block' }, (decision) => ({
      kind: 'deny' as const,
      rule: decision.rule.name,
      reason: buildDenyReason(decision.rule, 'matched'),
    }))
    .with({ kind: 'uncertain' }, (decision) => ({
      kind: 'deny' as const,
      rule: decision.rule.name,
      reason: buildDenyReason(decision.rule, 'unresolved'),
    }))
    .exhaustive();
}
