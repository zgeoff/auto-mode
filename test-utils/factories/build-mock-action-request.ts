import { faker } from '@faker-js/faker';
import type { ActionRequest } from '../../src/request/types.ts';
import { buildMockDecisionContext } from './build-mock-decision-context.ts';

interface ActionRequestOverrides extends Partial<Omit<ActionRequest, 'decisionContext'>> {
  readonly decisionContext?: Parameters<typeof buildMockDecisionContext>[0];
}

// The tool is static because its value gives a request its meaning; everything
// else is faker-driven, so a test that depends on a specific session id or
// working directory fails rather than passing by luck.
export function buildMockActionRequest(overrides: ActionRequestOverrides = {}): ActionRequest {
  const { decisionContext, ...rest } = overrides;

  return {
    sessionID: faker.string.uuid(),
    toolUseID: `toolu_${faker.string.alphanumeric(24)}`,
    cwd: `/${faker.system.directoryPath().replaceAll(/^\/+/g, '')}`,
    toolName: 'Bash',
    toolInput: { command: faker.git.commitMessage() },
    ...rest,
    decisionContext: buildMockDecisionContext(decisionContext),
  };
}
