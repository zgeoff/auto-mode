import { expect, test } from 'bun:test';
import { buildMockSessionScope } from '../../test-utils/factories/build-mock-session-scope.ts';
import { mergeSessionScope } from './merge-session-scope.ts';

test('it joins the scope of every record in record order', () => {
  const merged = mergeSessionScope([
    buildMockSessionScope({
      worktrees: ['/home/dev/app'],
      branches: [{ name: 'feat/a', commonDir: '/home/dev/app/.git' }],
      pullRequests: [{ repository: 'github.com/dev/app', number: 12, head: 'feat/a' }],
    }),
    buildMockSessionScope({
      worktrees: ['/home/dev/app-docs'],
      branches: [{ name: 'feat/b', commonDir: '/home/dev/app/.git' }],
      pullRequests: [{ repository: 'github.com/dev/app', number: 13, head: 'feat/b' }],
    }),
  ]);

  expect(merged).toStrictEqual({
    worktrees: ['/home/dev/app', '/home/dev/app-docs'],
    branches: [
      { name: 'feat/a', commonDir: '/home/dev/app/.git' },
      { name: 'feat/b', commonDir: '/home/dev/app/.git' },
    ],
    pullRequests: [
      { repository: 'github.com/dev/app', number: 12, head: 'feat/a' },
      { repository: 'github.com/dev/app', number: 13, head: 'feat/b' },
    ],
  });
});

test('it keeps one copy of a worktree and of a branch in one repository that two records name', () => {
  const merged = mergeSessionScope([
    buildMockSessionScope({
      worktrees: ['/home/dev/app'],
      branches: [{ name: 'feat/a', commonDir: '/home/dev/app/.git' }],
      pullRequests: [],
    }),
    buildMockSessionScope({
      worktrees: ['/home/dev/app'],
      branches: [{ name: 'feat/a', commonDir: '/home/dev/app/.git' }],
      pullRequests: [],
    }),
  ]);

  expect(merged).toStrictEqual({
    worktrees: ['/home/dev/app'],
    branches: [{ name: 'feat/a', commonDir: '/home/dev/app/.git' }],
    pullRequests: [],
  });
});

test('it keeps branches of one name in two repositories apart', () => {
  const merged = mergeSessionScope([
    buildMockSessionScope({ branches: [{ name: 'feat/a', commonDir: '/home/dev/app/.git' }] }),
    buildMockSessionScope({ branches: [{ name: 'feat/a', commonDir: '/home/dev/lib/.git' }] }),
  ]);

  expect(merged.branches).toStrictEqual([
    { name: 'feat/a', commonDir: '/home/dev/app/.git' },
    { name: 'feat/a', commonDir: '/home/dev/lib/.git' },
  ]);
});

test('it keeps the later head of a pull request that two records name', () => {
  const merged = mergeSessionScope([
    buildMockSessionScope({
      pullRequests: [{ repository: 'github.com/dev/app', number: 12, head: 'feat/a' }],
    }),
    buildMockSessionScope({
      pullRequests: [{ repository: 'github.com/dev/app', number: 12, head: 'feat/renamed' }],
    }),
  ]);

  expect(merged.pullRequests).toStrictEqual([
    { repository: 'github.com/dev/app', number: 12, head: 'feat/renamed' },
  ]);
});

test('it keeps pull requests with one number in two repositories apart', () => {
  const merged = mergeSessionScope([
    buildMockSessionScope({
      pullRequests: [{ repository: 'github.com/dev/app', number: 12, head: 'feat/a' }],
    }),
    buildMockSessionScope({
      pullRequests: [{ repository: 'github.com/dev/lib', number: 12, head: 'feat/a' }],
    }),
  ]);

  expect(merged.pullRequests).toStrictEqual([
    { repository: 'github.com/dev/app', number: 12, head: 'feat/a' },
    { repository: 'github.com/dev/lib', number: 12, head: 'feat/a' },
  ]);
});

test('it merges no records into an empty scope', () => {
  expect(mergeSessionScope([])).toStrictEqual({ worktrees: [], branches: [], pullRequests: [] });
});
