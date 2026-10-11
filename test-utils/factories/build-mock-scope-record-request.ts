import { faker } from '@faker-js/faker';
import type { ScopeRecordRequest } from '../../src/request/types.ts';

// A call that printed nothing; the command and its output decide what the
// session records, so a test states them.
export function buildMockScopeRecordRequest(
  overrides: Partial<ScopeRecordRequest> = {},
): ScopeRecordRequest {
  return {
    sessionID: faker.string.uuid(),
    cwd: `/${faker.system.directoryPath().replaceAll(/^\/+/g, '')}`,
    startedAt: faker.date.recent().getTime(),
    command: faker.lorem.words(3),
    resultText: '',
    ...overrides,
  };
}
