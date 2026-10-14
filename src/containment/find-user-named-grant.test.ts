import { expect, test } from 'bun:test';
import { findUserNamedGrant } from './find-user-named-grant.ts';

test('it finds the worktree name in a message that names it only as a source to read', () => {
  expect(
    findUserNamedGrant(
      [
        {
          kind: 'path',
          target: '/home/dev/src/harbor/.worktrees/export-csv/src/client/format-row.ts',
          grant: { kind: 'path' },
        },
      ],
      'Port the row formatter from the export-csv worktree into this branch.',
      { home: '/home/dev', defaultBranch: 'main' },
    ),
  ).toStrictEqual([
    {
      kind: 'path',
      target: '/home/dev/src/harbor/.worktrees/export-csv/src/client/format-row.ts',
      namedAs: 'export-csv',
    },
  ]);
});

test('it finds no grant for a worktree the message never names', () => {
  expect(
    findUserNamedGrant(
      [
        {
          kind: 'path',
          target: '/home/dev/src/harbor/.worktrees/columns-other',
          grant: { kind: 'path' },
        },
      ],
      'The columns PR merged. Clean up your own worktree for it.',
      { home: '/home/dev', defaultBranch: 'main' },
    ),
  ).toBeNull();
});

test('it finds the full path of a file the message names', () => {
  expect(
    findUserNamedGrant(
      [
        {
          kind: 'path',
          target: '/home/dev/src/harbor/.worktrees/label-check/label.test.ts',
          grant: { kind: 'path' },
        },
      ],
      'Write the test in /home/dev/src/harbor/.worktrees/label-check/label.test.ts, then run it.',
      { home: '/home/dev', defaultBranch: 'main' },
    ),
  ).toStrictEqual([
    {
      kind: 'path',
      target: '/home/dev/src/harbor/.worktrees/label-check/label.test.ts',
      namedAs: '/home/dev/src/harbor/.worktrees/label-check/label.test.ts',
    },
  ]);
});

test('it finds a directory the message names from home for a file below it', () => {
  expect(
    findUserNamedGrant(
      [{ kind: 'path', target: '/home/dev/src/harbor-site/index.html', grant: { kind: 'path' } }],
      'Mirror the built docs into ~/src/harbor-site/.',
      { home: '/home/dev', defaultBranch: 'main' },
    ),
  ).toStrictEqual([
    { kind: 'path', target: '/home/dev/src/harbor-site/index.html', namedAs: '~/src/harbor-site/' },
  ]);
});

test('it finds no grant for a worktree nested in the checkout the message names', () => {
  expect(
    findUserNamedGrant(
      [
        {
          kind: 'path',
          target: '/home/dev/src/harbor/.worktrees/other/a.ts',
          grant: { kind: 'path' },
        },
      ],
      'Work only in /home/dev/src/harbor.',
      { home: '/home/dev', defaultBranch: 'main' },
    ),
  ).toBeNull();
});

test.each([['/home/dev'], ['~/'], ['/home'], ['/']])(
  'it finds no grant when the message names only %s above the target',
  (named) => {
    expect(
      findUserNamedGrant(
        [{ kind: 'path', target: '/home/dev/notes/todo.md', grant: { kind: 'path' } }],
        `Keep everything under ${named} tidy.`,
        { home: '/home/dev', defaultBranch: 'main' },
      ),
    ).toBeNull();
  },
);

test('it finds no grant for a worktree whose name only starts a longer word in the message', () => {
  expect(
    findUserNamedGrant(
      [
        {
          kind: 'path',
          target: '/home/dev/src/harbor/.worktrees/export/a.ts',
          grant: { kind: 'path' },
        },
      ],
      'Write it into the export-csv worktree.',
      { home: '/home/dev', defaultBranch: 'main' },
    ),
  ).toBeNull();
});

test('it finds a branch the message names at the end of a sentence', () => {
  expect(
    findUserNamedGrant(
      [{ kind: 'branch', target: 'feat/export-csv', grant: { kind: 'branch' } }],
      'Both PRs merged. Delete feat/export-csv.',
      { home: '/home/dev', defaultBranch: 'main' },
    ),
  ).toStrictEqual([{ kind: 'branch', target: 'feat/export-csv', namedAs: 'feat/export-csv' }]);
});

test.each([['main'], ['master'], ['trunk'], ['develop']])(
  'it finds no grant for the protected branch %s, even when the message names it',
  (branch) => {
    expect(
      findUserNamedGrant(
        [{ kind: 'branch', target: branch, grant: { kind: 'branch' } }],
        `Push the fix straight to ${branch}.`,
        { home: '/home/dev', defaultBranch: null },
      ),
    ).toBeNull();
  },
);

test('it finds no grant for the default branch of the checkout, even when the message names it', () => {
  expect(
    findUserNamedGrant(
      [{ kind: 'branch', target: 'stable', grant: { kind: 'branch' } }],
      'Push the fix straight to stable.',
      { home: '/home/dev', defaultBranch: 'stable' },
    ),
  ).toBeNull();
});

test.each([
  ['#512', 'Merge #512 once it is green.'],
  ['PR 512', 'Merge PR 512 once it is green.'],
  ['pr#512', 'Merge pr#512 once it is green.'],
  ['https://github.com/dev/app/pull/512', 'Merge https://github.com/dev/app/pull/512 now.'],
])('it finds a pull request the message names as %s', (namedAs, message) => {
  expect(
    findUserNamedGrant(
      [
        {
          kind: 'remote-write',
          target: 'gh pr merge',
          grant: { kind: 'pull-request', number: 512 },
        },
      ],
      message,
      { home: '/home/dev', defaultBranch: 'main' },
    ),
  ).toStrictEqual([{ kind: 'remote-write', target: 'gh pr merge', namedAs }]);
});

test('it finds no grant for a pull request number the message holds without naming a pull request', () => {
  expect(
    findUserNamedGrant(
      [
        {
          kind: 'remote-write',
          target: 'gh pr merge',
          grant: { kind: 'pull-request', number: 512 },
        },
      ],
      'Bump the timeout to 512 and merge it.',
      { home: '/home/dev', defaultBranch: 'main' },
    ),
  ).toBeNull();
});

test('it finds no grant for a finding no message can name, even when the message holds its target', () => {
  expect(
    findUserNamedGrant(
      [{ kind: 'credential', target: '/home/dev/.ssh/config' }],
      'Edit /home/dev/.ssh/config to add the build host.',
      { home: '/home/dev', defaultBranch: 'main' },
    ),
  ).toBeNull();
});

test('it finds no grant when the message names only one of two targets', () => {
  expect(
    findUserNamedGrant(
      [
        {
          kind: 'path',
          target: '/home/dev/src/harbor/.worktrees/columns-a',
          grant: { kind: 'path' },
        },
        {
          kind: 'path',
          target: '/home/dev/src/harbor/.worktrees/columns-b',
          grant: { kind: 'path' },
        },
      ],
      'Remove the columns-a worktree.',
      { home: '/home/dev', defaultBranch: 'main' },
    ),
  ).toBeNull();
});
