import { buildDecisionRequest, loadPolicy } from 'auto-mode';
import type { DecisionRule } from 'auto-mode';
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
