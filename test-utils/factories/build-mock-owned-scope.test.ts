import { expect, test } from 'bun:test';
import { buildMockOwnedScope } from './build-mock-owned-scope.ts';

test('it builds a default owned scope', () => {
  expect(buildMockOwnedScope()).toStrictEqual({
    home: expect.toStartWith('/'),
    worktrees: [],
    branches: [],
    currentBranch: expect.toBeString(),
    remotes: [],
    pullRequests: [],
    pathGlobs: [],
  });
});

test('it applies overrides on top of the defaults', () => {
  const scope = buildMockOwnedScope({
    home: '/repo',
    worktrees: ['/repo/.worktrees/feature'],
    currentBranch: null,
  });

  expect(scope).toStrictEqual({
    home: '/repo',
    worktrees: ['/repo/.worktrees/feature'],
    branches: [],
    currentBranch: null,
    remotes: [],
    pullRequests: [],
    pathGlobs: [],
  });
});
