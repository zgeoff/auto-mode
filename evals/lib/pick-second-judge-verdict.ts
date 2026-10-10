import type { DecisionRequest, DecisionResult } from 'auto-mode';
import type { JudgeVerdict } from './parse-judge-verdict.ts';
import type { EvaluationVerdict } from './pick-evaluation-verdict.ts';
import { pickEvaluationVerdict } from './pick-evaluation-verdict.ts';

export interface SecondJudgeVerdict {
  readonly eligible: boolean;
  readonly verdict: EvaluationVerdict;
}

export function pickSecondJudgeVerdict(
  request: DecisionRequest,
  result: DecisionResult,
  minConfidence: number,
  judge: JudgeVerdict | null,
): SecondJudgeVerdict {
  const first = pickEvaluationVerdict(request, result, minConfidence);

  const eligible =
    first.kind === 'ask' &&
    Object.keys(request.rules).every((id) => result.answers[id]?.choice === 'allow');

  if (eligible && judge?.kind === 'allow') {
    return { eligible, verdict: { kind: 'allow' } };
  }

  return { eligible, verdict: first };
}
