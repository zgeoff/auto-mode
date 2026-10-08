import { faker } from '@faker-js/faker';
import type { DecisionRequest } from '../../src/model/types.ts';
import { buildMockClaudeRules } from './build-mock-claude-rules.ts';
import { buildMockDecisionContext } from './build-mock-decision-context.ts';
import { buildMockDecisionQuestion } from './build-mock-decision-question.ts';
import { buildMockDecisionRule } from './build-mock-decision-rule.ts';
import { buildMockRepositoryContext } from './build-mock-repository-context.ts';

type State = DecisionRequest['state'];

interface StateOverrides extends Partial<
  Omit<State, 'configuredRules' | 'repositoryContext' | 'taskContext' | 'action'>
> {
  readonly configuredRules?: Parameters<typeof buildMockClaudeRules>[0];
  readonly repositoryContext?: Parameters<typeof buildMockRepositoryContext>[0];
  readonly taskContext?: Parameters<typeof buildMockDecisionContext>[0];
  readonly action?: Partial<State['action']>;
}

interface DecisionRequestOverrides extends Partial<Omit<DecisionRequest, 'state'>> {
  readonly state?: StateOverrides;
}

// One shipped rule and one question under the same key, the shape the request
// builder gives each rule; a rules override gets one question per rule unless
// the test states the questions. The action is a Bash command.
export function buildMockDecisionRequest(
  overrides: DecisionRequestOverrides = {},
): DecisionRequest {
  const { configuredRules, repositoryContext, taskContext, action, ...stateRest } =
    overrides.state ?? {};

  const rules = overrides.rules ?? { rule_0: buildMockDecisionRule() };

  return {
    questions:
      overrides.questions ??
      Object.fromEntries(Object.keys(rules).map((id) => [id, buildMockDecisionQuestion()])),
    rules,
    state: {
      policy: faker.lorem.paragraphs(2),
      answerGuidance: faker.lorem.paragraph(),
      rulesSource: 'shipped',
      lastUserMessage: null,
      ...stateRest,
      configuredRules: buildMockClaudeRules(configuredRules),
      repositoryContext: buildMockRepositoryContext(repositoryContext),
      taskContext: buildMockDecisionContext(taskContext),
      action: {
        tool: 'Bash',
        cwd: `/${faker.system.directoryPath().replaceAll(/^\/+/g, '')}`,
        input: { command: faker.git.commitMessage() },
        ...action,
      },
    },
  };
}
