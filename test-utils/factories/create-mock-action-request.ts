import { faker } from '@faker-js/faker';
import type { ActionRequest } from '../../src/request/types.ts';

// The tool is static because its value gives a request its meaning; everything
// else is faker-driven, so a test that depends on a specific session id or
// working directory fails rather than passing by luck.
export function createMockActionRequest(overrides: Partial<ActionRequest> = {}): ActionRequest {
  return {
    sessionID: faker.string.uuid(),
    cwd: `/${faker.system.directoryPath().replaceAll(/^\/+/g, '')}`,
    toolName: 'Bash',
    toolInput: { command: faker.git.commitMessage() },
    ...overrides,
  };
}
