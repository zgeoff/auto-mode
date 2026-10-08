import { expect, test } from 'bun:test';
import { buildMockScopeFacts } from '../../test-utils/factories/build-mock-scope-facts.ts';
import { mergeScopeFacts } from './merge-scope-facts.ts';

test('it joins the facts of every source in source order', () => {
  const merged = mergeScopeFacts([
    buildMockScopeFacts({
      worktrees: ['/home/dev/app'],
      branches: ['feat/a'],
      pullRequests: [{ repository: 'github.com/dev/app', number: 12, head: 'feat/a' }],
      pathGlobs: ['/home/dev/scratch/**'],
    }),
    buildMockScopeFacts({
      worktrees: ['/home/dev/app-docs'],
      branches: ['feat/b'],
      pullRequests: [{ repository: 'github.com/dev/app', number: 13, head: 'feat/b' }],
      pathGlobs: ['/home/dev/notes/**'],
    }),
  ]);

  expect(merged).toStrictEqual({
    worktrees: ['/home/dev/app', '/home/dev/app-docs'],
    branches: ['feat/a', 'feat/b'],
    pullRequests: [
      { repository: 'github.com/dev/app', number: 12, head: 'feat/a' },
      { repository: 'github.com/dev/app', number: 13, head: 'feat/b' },
    ],
    pathGlobs: ['/home/dev/scratch/**', '/home/dev/notes/**'],
  });
});

test('it keeps one copy of a worktree, branch and path glob that two sources name', () => {
  const merged = mergeScopeFacts([
    buildMockScopeFacts({
      worktrees: ['/home/dev/app'],
      branches: ['feat/a'],
      pullRequests: [],
      pathGlobs: ['/home/dev/scratch/**'],
    }),
    buildMockScopeFacts({
      worktrees: ['/home/dev/app'],
      branches: ['feat/a'],
      pullRequests: [],
      pathGlobs: ['/home/dev/scratch/**'],
    }),
  ]);

  expect(merged).toStrictEqual({
    worktrees: ['/home/dev/app'],
    branches: ['feat/a'],
    pullRequests: [],
    pathGlobs: ['/home/dev/scratch/**'],
  });
});

test('it keeps the later head of a pull request that two sources name', () => {
  const merged = mergeScopeFacts([
    buildMockScopeFacts({
      pullRequests: [{ repository: 'github.com/dev/app', number: 12, head: 'feat/a' }],
    }),
    buildMockScopeFacts({
      pullRequests: [{ repository: 'github.com/dev/app', number: 12, head: 'feat/renamed' }],
    }),
  ]);

  expect(merged.pullRequests).toStrictEqual([
    { repository: 'github.com/dev/app', number: 12, head: 'feat/renamed' },
  ]);
});

test('it keeps pull requests with one number in two repositories apart', () => {
  const merged = mergeScopeFacts([
    buildMockScopeFacts({
      pullRequests: [{ repository: 'github.com/dev/app', number: 12, head: 'feat/a' }],
    }),
    buildMockScopeFacts({
      pullRequests: [{ repository: 'github.com/dev/lib', number: 12, head: 'feat/a' }],
    }),
  ]);

  expect(merged.pullRequests).toStrictEqual([
    { repository: 'github.com/dev/app', number: 12, head: 'feat/a' },
    { repository: 'github.com/dev/lib', number: 12, head: 'feat/a' },
  ]);
});

test('it merges no sources into empty facts', () => {
  expect(mergeScopeFacts([])).toStrictEqual({
    worktrees: [],
    branches: [],
    pullRequests: [],
    pathGlobs: [],
  });
});
