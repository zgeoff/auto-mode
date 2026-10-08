import { expect, test } from 'bun:test';
import { EMPTY_SCOPE_FACTS, EMPTY_SESSION_SCOPE } from './types.ts';

test('it holds scope facts with no worktree, branch, pull request or path glob', () => {
  expect(EMPTY_SCOPE_FACTS).toStrictEqual({
    worktrees: [],
    branches: [],
    pullRequests: [],
    pathGlobs: [],
  });
});

test('it holds a session scope with no worktree, branch or pull request', () => {
  expect(EMPTY_SESSION_SCOPE).toStrictEqual({ worktrees: [], branches: [], pullRequests: [] });
});
