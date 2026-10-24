import { faker } from '@faker-js/faker';
import type { OwnedScope } from '../../src/scope/types.ts';

export function buildMockOwnedScope(overrides: Partial<OwnedScope> = {}): OwnedScope {
  return {
    home: `/${faker.system.directoryPath().replaceAll(/^\/+/gu, '')}`,
    worktrees: [],
    branches: [],
    currentBranch: faker.git.branch(),
    remotes: [],
    pullRequests: [],
    pathGlobs: [],
    ...overrides,
  };
}
