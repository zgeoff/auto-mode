import type { DeniedRule } from '../types.ts';
import { collectBlockingRules } from './collect-blocking-rules.ts';
import type { DecisionRequest, DecisionResult } from './types.ts';

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
