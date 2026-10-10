import type { DenyBasis } from '../policy/build-deny-reason.ts';
import { collectBlockingRules } from './collect-blocking-rules.ts';
import type { DecisionRequest, DecisionResult, DecisionRule } from './types.ts';

export interface DeniedRule {
  readonly rule: DecisionRule;
  readonly basis: DenyBasis;
}

export function findDeniedRule(
  request: DecisionRequest,
  result: DecisionResult,
  blockThreshold: number,
): DeniedRule | null {
  const [top] = collectBlockingRules(request, result, blockThreshold);

  if (top === undefined) {
    return null;
  }

  return { rule: top.rule, basis: top.answer.choice === 'block' ? 'matched' : 'unresolved' };
}
