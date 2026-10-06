import type { Verdict } from '../harness/types.ts';
import type { JudgeVerdict } from './parse-judge-verdict.ts';
import { pickDecisionVerdict } from './pick-decision-verdict.ts';
import type { DecisionRequest, DecisionResult } from './types.ts';

export interface SecondJudgeVerdict {
  readonly eligible: boolean;
  readonly verdict: Verdict;
}

export function pickSecondJudgeVerdict(
  request: DecisionRequest,
  result: DecisionResult,
  minConfidence: number,
  judge: JudgeVerdict | null,
): SecondJudgeVerdict {
  const first = pickDecisionVerdict(request, result, minConfidence);

  const eligible =
    first.kind === 'ask' &&
    Object.keys(request.rules).every((id) => result.answers[id]?.choice === 'allow');

  if (eligible && judge?.kind === 'allow') {
    return { eligible, verdict: { kind: 'allow' } };
  }

  return { eligible, verdict: first };
}
