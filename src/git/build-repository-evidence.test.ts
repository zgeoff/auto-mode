import { expect, test } from 'bun:test';
import { buildMockTaskScopeSummary } from '../../test-utils/factories/build-mock-task-scope-summary.ts';
import { buildRepositoryEvidence } from './build-repository-evidence.ts';

test('it keeps the task scope when the cwd is not a checkout', () => {
  const taskScope = buildMockTaskScopeSummary({ worktrees: ['/repo'], branches: ['feature'] });

  const evidence = buildRepositoryEvidence(
    { cwd: '/repo', checkout: null, head: null, remotes: [] },
    taskScope,
  );

  expect(evidence).toStrictEqual({ cwd: '/repo', branch: null, defaultBranch: null, taskScope });
});

test('it adds the task scope to the checkout evidence', () => {
  const taskScope = buildMockTaskScopeSummary({ branches: ['feature'] });

  const evidence = buildRepositoryEvidence(
    {
      cwd: '/repo',
      checkout: { worktree: '/repo', gitDir: '/repo/.git', commonDir: '/repo/.git' },
      head: { branch: 'feature', defaultBranch: null },
      remotes: [],
    },
    taskScope,
  );

  expect(evidence).toStrictEqual({
    cwd: '/repo',
    branch: 'feature',
    defaultBranch: null,
    remotes: [],
    taskScope,
  });
});

test('it returns no evidence outside a checkout when there is no task scope', () => {
  const evidence = buildRepositoryEvidence(
    { cwd: '/repo', checkout: null, head: null, remotes: [] },
    undefined,
  );

  expect(evidence).toBeNull();
});
