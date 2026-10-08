import { faker } from '@faker-js/faker';
import type { DecisionRequest } from '../../src/model/types.ts';
import { buildMockClaudeRules } from './build-mock-claude-rules.ts';
import { buildMockDecisionContext } from './build-mock-decision-context.ts';
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

// One question about one shipped rule under the same key, the shape the request
// builder gives each rule; the action is a Bash command.
export function buildMockDecisionRequest(
  overrides: DecisionRequestOverrides = {},
): DecisionRequest {
  const { state, ...rest } = overrides;
  const { configuredRules, repositoryContext, taskContext, action, ...stateRest } = state ?? {};

  return {
    questions: {
      rule_0: {
        type: 'choice',
        instructions: faker.lorem.paragraph(),
        criteria: {
          allow: faker.lorem.sentence(),
          block: faker.lorem.sentence(),
          ask: faker.lorem.sentence(),
        },
      },
    },
    rules: { rule_0: buildMockDecisionRule() },
    ...rest,
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
