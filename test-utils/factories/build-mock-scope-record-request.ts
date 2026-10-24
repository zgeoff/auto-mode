import { faker } from '@faker-js/faker';
import type { ScopeRecordRequest } from '../../src/request/types.ts';

export function buildMockScopeRecordRequest(
  overrides: Partial<ScopeRecordRequest> = {},
): ScopeRecordRequest {
  return {
    sessionID: faker.string.uuid(),
    cwd: `/${faker.system.directoryPath().replaceAll(/^\/+/gu, '')}`,
    startedAt: faker.date.recent().getTime(),
    command: faker.lorem.words(3),
    resultText: '',
    ...overrides,
  };
}
