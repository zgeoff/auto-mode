import { faker } from '@faker-js/faker';
import type { ActionRequest } from '../../src/request/types.ts';
import { buildMockDecisionContext } from './build-mock-decision-context.ts';

interface ActionRequestOverrides extends Partial<Omit<ActionRequest, 'decisionContext'>> {
  readonly decisionContext?: Parameters<typeof buildMockDecisionContext>[0] | undefined;
}

// An explicit undefined decision context leaves the field out, as a request
// from a harness that sends no task context arrives.
export function buildMockActionRequest(overrides: ActionRequestOverrides = {}): ActionRequest {
  const { decisionContext, ...rest } = overrides;

  const request = {
    sessionID: faker.string.uuid(),
    toolUseID: `toolu_${faker.string.alphanumeric(24)}`,
    cwd: `/${faker.system.directoryPath().replaceAll(/^\/+/g, '')}`,
    toolName: 'Bash',
    toolInput: { command: faker.git.commitMessage() },
    ...rest,
  };

  return Object.hasOwn(overrides, 'decisionContext') && decisionContext === undefined
    ? request
    : { ...request, decisionContext: buildMockDecisionContext(decisionContext) };
}
