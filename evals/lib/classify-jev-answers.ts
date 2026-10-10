import type { DecisionRequest, DecisionResult } from 'auto-mode';
import { classifyDecisionAnswers } from 'auto-mode/eval';

export type JevClass =
  | { readonly kind: 'allow'; readonly rule: null; readonly pBlock: number }
  | {
      readonly kind: 'all-allow-ask' | 'deny';
      readonly rule: string;
      readonly pBlock: number;
    };

const THRESHOLD = 0.8;

// An uncertain answer set whose every choice is allow is the ask the recorded
// reports release under release-all-allow; any other short of a confident allow
// is a deny. The rule is the one the shipped classifier names.
export function classifyJevAnswers(request: DecisionRequest, result: DecisionResult): JevClass {
  const decision = classifyDecisionAnswers(request, result, THRESHOLD);
  const answers = Object.keys(request.rules).map((id) => result.answers[id]);
  const pBlock = Math.max(0, ...answers.map((answer) => answer?.probabilities.block ?? 0));

  if (decision.kind === 'allow') {
    return { kind: 'allow', rule: null, pBlock };
  }

  const isAllAllow =
    decision.kind === 'uncertain' && answers.every((answer) => answer?.choice === 'allow');

  return { kind: isAllAllow ? 'all-allow-ask' : 'deny', rule: decision.rule.name, pBlock };
}
