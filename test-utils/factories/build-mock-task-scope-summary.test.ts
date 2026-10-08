import { expect, test } from 'bun:test';
import { buildMockTaskScopeSummary } from './build-mock-task-scope-summary.ts';

test('it builds a default task scope summary', () => {
  expect(buildMockTaskScopeSummary()).toStrictEqual({
    worktrees: [],
    branches: [],
    pullRequests: [],
  });
});

test('it applies overrides on top of the defaults', () => {
  expect(buildMockTaskScopeSummary({ branches: ['feature'] })).toStrictEqual({
    worktrees: [],
    branches: ['feature'],
    pullRequests: [],
  });
});
