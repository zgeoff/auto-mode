import { faker } from '@faker-js/faker';
import type { HookPayload } from '../../src/harness/types.ts';

// The discriminators are static because their value gives a payload its
// meaning; everything else is faker-driven, so a test that depends on a
// specific session id or working directory fails rather than passing by luck.
export function createMockHookPayload(overrides: Partial<HookPayload> = {}): HookPayload {
  return {
    harness: 'claude',
    event: 'PreToolUse',
    sessionId: faker.string.uuid(),
    cwd: `/${faker.system.directoryPath().replaceAll(/^\/+/g, '')}`,
    toolName: 'Bash',
    toolInput: { command: faker.git.commitMessage() },
    raw: {},
    ...overrides,
  };
}
