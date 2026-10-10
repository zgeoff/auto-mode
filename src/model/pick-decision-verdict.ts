import { buildDenyReason } from '../policy/build-deny-reason.ts';
import type { Verdict } from '../request/types.ts';
import { findDeniedRule } from './find-denied-rule.ts';
import type { DecisionRequest, DecisionResult } from './types.ts';

export function pickDecisionVerdict(
  request: DecisionRequest,
  result: DecisionResult,
  blockThreshold: number,
): Verdict {
  const denied = findDeniedRule(request, result, blockThreshold);

  if (denied === null) {
    return { kind: 'allow' };
  }

  return {
    kind: 'deny',
    rule: denied.rule.name,
    reason: buildDenyReason(denied.rule, denied.basis),
  };
}
