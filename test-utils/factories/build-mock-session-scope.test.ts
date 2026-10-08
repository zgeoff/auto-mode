import { expect, test } from 'bun:test';
import { buildMockSessionScope } from './build-mock-session-scope.ts';

test('it builds a default session scope', () => {
  expect(buildMockSessionScope()).toStrictEqual({ worktrees: [], branches: [], pullRequests: [] });
});

test('it applies overrides on top of the defaults', () => {
  expect(
    buildMockSessionScope({ branches: [{ name: 'feat/x', commonDir: '/work/app/.git' }] }),
  ).toStrictEqual({
    worktrees: [],
    branches: [{ name: 'feat/x', commonDir: '/work/app/.git' }],
    pullRequests: [],
  });
});
