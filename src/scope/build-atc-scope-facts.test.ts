import { expect, test } from 'bun:test';
import { buildAtcScopeFacts } from './build-atc-scope-facts.ts';
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
    pullRequests: [{ number: 12, head: 'feat', repository: 'dev/app' }],
    pathGlobs: [],
  });
});

test('it owns no branch when no declared path shares the action repository', () => {
  expect(buildAtcScopeFacts(RECORD, () => false).branches).toStrictEqual([]);
});
