import { expect, test } from 'bun:test';
import { buildMockScopeFacts } from './build-mock-scope-facts.ts';

test('it builds a default scope facts', () => {
  expect(buildMockScopeFacts()).toStrictEqual({
    worktrees: [],
    branches: [],
    pullRequests: [],
    pathGlobs: [],
  });
});

test('it applies overrides on top of the defaults', () => {
  expect(buildMockScopeFacts({ branches: ['feature'] })).toStrictEqual({
    worktrees: [],
    branches: ['feature'],
    pullRequests: [],
    pathGlobs: [],
  });
});
