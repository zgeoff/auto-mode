import { expect, test } from 'bun:test';
import { buildMockTaskScopeSessions } from './build-mock-task-scope-sessions.ts';

test('it builds a default task scope sessions recording', () => {
  expect(buildMockTaskScopeSessions()).toStrictEqual({
    home: expect.toStartWith('/'),
    remotes: [],
    worktreeBranches: {},
    pullRequestHeads: {},
    atc: {},
    sessions: [],
  });
});

test('it applies overrides on top of the defaults', () => {
  const recording = buildMockTaskScopeSessions({
    pullRequestHeads: { '5': 'feat/a' },
    sessions: [{ name: 'one', entries: [{ case: 'R1' }] }],
  });

  expect(recording).toStrictEqual({
    home: expect.toStartWith('/'),
    remotes: [],
    worktreeBranches: {},
    pullRequestHeads: { '5': 'feat/a' },
    atc: {},
    sessions: [{ name: 'one', entries: [{ case: 'R1' }] }],
  });
});
