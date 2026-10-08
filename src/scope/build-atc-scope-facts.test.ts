import { expect, test } from 'bun:test';
import { buildAtcScopeFacts } from './build-atc-scope-facts.ts';
import { buildTaskScope } from './build-task-scope.ts';
import type { AtcSessionRecord } from './load-atc-session-record.ts';

const RECORD: AtcSessionRecord = {
  format: 'atc.session-record',
  version: 1,
  session: 'atc-1',
  scope: {
    workspace: { path: '/repo/.worktrees/feat', branch: 'feat' },
    worktrees: [
      { path: '/repo/.worktrees/extra', branch: 'extra' },
      { path: '/other/.worktrees/x', branch: 'x' },
    ],
    branches: [
      { name: 'later', repo: '/repo' },
      { name: 'elsewhere', repo: '/other' },
      { name: 'plain' },
    ],
    pullRequests: [
      { repo: 'dev/app', number: 12, branch: 'feat' },
      { repo: 'dev/app', number: 13, branch: null },
      {
        repo: 'team/lib',
        number: 4,
        url: 'https://git.example.com/team/lib/pull/4',
        branch: 'feat',
      },
    ],
  },
};

const COMMON_DIRS = new Map([
  ['/repo/.worktrees/feat', '/repo/.git'],
  ['/repo/.worktrees/extra', '/repo/.git'],
  ['/repo', '/repo/.git'],
  ['/other/.worktrees/x', '/other/.git'],
  ['/other', '/other/.git'],
]);

test('it owns every declared checkout and the branches that live in the action repository', () => {
  expect(
    buildAtcScopeFacts(RECORD, (path) => COMMON_DIRS.get(path) === '/repo/.git'),
  ).toStrictEqual({
    worktrees: ['/repo/.worktrees/feat', '/repo/.worktrees/extra', '/other/.worktrees/x'],
    branches: ['feat', 'extra', 'later', 'plain'],
    pullRequests: [
      { number: 12, head: 'feat', repository: 'github.com/dev/app' },
      { number: 4, head: 'feat', repository: 'git.example.com/team/lib' },
    ],
    pathGlobs: [],
  });
});

test('it owns no branch when no declared path shares the action repository', () => {
  expect(buildAtcScopeFacts(RECORD, () => false).branches).toStrictEqual([]);
});

test('it keeps a declared PR in the task scope when the checkout remote names its repository', () => {
  const facts = buildAtcScopeFacts(RECORD, (path) => COMMON_DIRS.get(path) === '/repo/.git');

  const scope = buildTaskScope({
    home: '/home/dev',
    currentBranch: 'main',
    defaultBranch: 'main',
    remotes: [{ name: 'origin', url: 'git@github.com:dev/app.git' }],
    facts: [facts],
  });

  expect(scope.pullRequests).toStrictEqual([{ number: 12, repository: 'github.com/dev/app' }]);
});
