import { buildDecisionRequest } from '../../src/model/build-decision-request.ts';
import type { DecisionRule } from '../../src/model/types.ts';
import { loadPolicy } from '../../src/policy/load-policy.ts';
import { buildMockActionRequest } from '../../test-utils/factories/build-mock-action-request.ts';
import { buildMockClaudeRules } from '../../test-utils/factories/build-mock-claude-rules.ts';

export async function loadShippedRuleTiers(): Promise<
  Readonly<Record<string, DecisionRule['tier']>>
> {
  const policy = await loadPolicy({}, 'decision.md');

  const request = buildDecisionRequest(
    buildMockActionRequest(),
    policy,
    buildMockClaudeRules(),
    null,
    'shipped',
  );

  return Object.fromEntries(Object.values(request.rules).map((rule) => [rule.name, rule.tier]));
}
