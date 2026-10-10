import type { DecisionRequest, DecisionResult } from 'auto-mode';
import { DEFAULT_BLOCK_THRESHOLD, pickDecisionVerdict } from 'auto-mode/eval';

export type JevClass =
  | { readonly kind: 'allow'; readonly rule: null; readonly pBlock: number }
  | {
      readonly kind: 'all-allow-ask' | 'deny';
      readonly rule: string;
      readonly pBlock: number;
    };

// A live answer set gets the shipped two-choice combiner's verdict. Recorded
// three-choice answers keep the combiner they were recorded under, so replays
// classify them from the recorded report instead.
export function classifyLiveJevAnswers(request: DecisionRequest, result: DecisionResult): JevClass {
  const verdict = pickDecisionVerdict(request, result, DEFAULT_BLOCK_THRESHOLD);
  const answers = Object.keys(request.rules).map((id) => result.answers[id]);
  const pBlock = Math.max(0, ...answers.map((answer) => answer?.probabilities.block ?? 0));

  return verdict.kind === 'allow'
    ? { kind: 'allow', rule: null, pBlock }
    : { kind: 'deny', rule: verdict.rule, pBlock };
}
