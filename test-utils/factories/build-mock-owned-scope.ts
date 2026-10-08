import { faker } from '@faker-js/faker';
import type { OwnedScope } from '../../src/containment/collect-scope-findings.ts';

// Every list grants the task ownership of a target, so each starts empty and a
// test grants what its scenario needs.
export function buildMockOwnedScope(overrides: Partial<OwnedScope> = {}): OwnedScope {
  return {
    home: `/${faker.system.directoryPath().replaceAll(/^\/+/g, '')}`,
    worktrees: [],
    branches: [],
    currentBranch: faker.git.branch(),
    remotes: [],
    pullRequests: [],
    pathGlobs: [],
    ...overrides,
  };
}
