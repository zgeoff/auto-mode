import { pickDecisionVerdict } from 'auto-mode/eval';
import type { DecisionRequest, DecisionResult } from 'auto-mode/eval';
import type { EvaluationVerdict } from './pick-evaluation-verdict.ts';

// Live answers only: recorded reports keep the combiner that wrote them.
export function pickLiveEvaluationVerdict(
  request: DecisionRequest,
  result: DecisionResult,
  blockThreshold: number,
): EvaluationVerdict {
  const verdict = pickDecisionVerdict(request, result, blockThreshold);

  return verdict.kind === 'allow' ? { kind: 'allow' } : { kind: 'deny', rule: verdict.rule };
}
