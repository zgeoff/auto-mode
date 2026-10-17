import { buildDecisionRequest, loadPolicy } from 'auto-mode/eval';
import type { DecisionRule } from 'auto-mode/eval';
import { buildMockActionRequest } from '../../test-utils/factories/build-mock-action-request.ts';
import { buildMockClaudeRules } from '../../test-utils/factories/build-mock-claude-rules.ts';

export async function loadShippedRuleTiers(): Promise<
  Readonly<Record<string, DecisionRule['tier']>>
> {
  const policy = await loadPolicy({}, 'decision.md');

  const request = buildDecisionRequest(buildMockActionRequest(), policy, {
    configuredRules: buildMockClaudeRules(),
    lastUserMessage: null,
    rulesSource: 'shipped',
  });

  return Object.fromEntries(Object.values(request.rules).map((rule) => [rule.name, rule.tier]));
}
