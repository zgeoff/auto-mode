import { buildDenyReason } from '../policy/build-deny-reason.ts';
import type { Verdict } from '../request/types.ts';
import { collectBlockingRules } from './collect-blocking-rules.ts';
import type { DecisionRequest, DecisionResult } from './types.ts';

export function pickDecisionVerdict(
  request: DecisionRequest,
  result: DecisionResult,
  blockThreshold: number,
): Verdict {
  const [top] = collectBlockingRules(request, result, blockThreshold);

  if (top === undefined) {
    return { kind: 'allow' };
  }

  const basis = top.answer.choice === 'block' ? 'matched' : 'unresolved';

  return { kind: 'deny', rule: top.rule.name, reason: buildDenyReason(top.rule, basis) };
}
