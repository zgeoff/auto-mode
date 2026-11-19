import { expect, test } from 'bun:test';
import { buildMockRepositoryContext } from './build-mock-repository-context.ts';

test('it builds a default repository context', () => {
  expect(buildMockRepositoryContext()).toStrictEqual({
    cwd: expect.toStartWith('/'),
    branch: expect.toBeString(),
    defaultBranch: expect.toBeString(),
    remotes: [{ name: expect.toBeString(), url: expect.toStartWith('https://github.com/') }],
    taskScope: { worktrees: [], branches: [], pullRequests: [] },
  });
});

test('it applies overrides on top of the defaults', () => {
  const context = buildMockRepositoryContext({
    branch: null,
    remotes: [],
    taskScope: { branches: ['feature'] },
  });

  expect(context).toStrictEqual({
    cwd: expect.toStartWith('/'),
    branch: null,
    defaultBranch: expect.toBeString(),
    remotes: [],
    taskScope: { worktrees: [], branches: ['feature'], pullRequests: [] },
  });
});
