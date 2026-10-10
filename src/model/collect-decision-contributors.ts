import { collectBlockingRules } from './collect-blocking-rules.ts';
import type { DecisionDiagnostics, DecisionRequest, DecisionResult } from './types.ts';

export function collectDecisionContributors(
  request: DecisionRequest,
  result: DecisionResult,
  blockThreshold: number,
): DecisionDiagnostics['contributors'] {
  return collectBlockingRules(request, result, blockThreshold).map((entry) => ({
    rule: entry.rule.source === 'shipped' ? entry.rule.name : entry.id,
    source: entry.rule.source,
    tier: entry.rule.tier,
    choice: entry.answer.choice,
    confidence: entry.answer.confidence,
    blockProbability: entry.answer.probabilities.block,
  }));
}
