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
      paths: ['/srv/notes'],
      replyChannels: [{ tool: 'SendMessage', field: 'to', recipient: 'lead' }],
    }),
    buildMockScopeFacts({
      worktrees: ['/home/dev/app-docs'],
      branches: ['feat/b'],
      pullRequests: [{ repository: 'github.com/dev/app', number: 13, head: 'feat/b' }],
      pathGlobs: ['/home/dev/notes/**'],
      paths: ['/srv/drafts'],
      replyChannels: [{ tool: 'mcp__chat__post', field: 'channel', recipient: 'ops' }],
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
    paths: ['/srv/notes', '/srv/drafts'],
    replyChannels: [
      { tool: 'SendMessage', field: 'to', recipient: 'lead' },
      { tool: 'mcp__chat__post', field: 'channel', recipient: 'ops' },
    ],
  });
});

test('it keeps one copy of a worktree, branch, path glob, path and reply channel that two sources name', () => {
  const merged = mergeScopeFacts([
    buildMockScopeFacts({
      worktrees: ['/home/dev/app'],
      branches: ['feat/a'],
      pullRequests: [],
      pathGlobs: ['/home/dev/scratch/**'],
      paths: ['/srv/notes'],
      replyChannels: [{ tool: 'SendMessage', field: 'to', recipient: 'lead' }],
    }),
    buildMockScopeFacts({
      worktrees: ['/home/dev/app'],
      branches: ['feat/a'],
      pullRequests: [],
      pathGlobs: ['/home/dev/scratch/**'],
      paths: ['/srv/notes'],
      replyChannels: [{ tool: 'SendMessage', field: 'to', recipient: 'lead' }],
    }),
  ]);

  expect(merged).toStrictEqual({
    worktrees: ['/home/dev/app'],
    branches: ['feat/a'],
    pullRequests: [],
    pathGlobs: ['/home/dev/scratch/**'],
    paths: ['/srv/notes'],
    replyChannels: [{ tool: 'SendMessage', field: 'to', recipient: 'lead' }],
  });
});

test('it keeps reply channels to one recipient through two fields apart', () => {
  const merged = mergeScopeFacts([
    buildMockScopeFacts({
      replyChannels: [{ tool: 'SendMessage', field: 'to', recipient: 'lead' }],
    }),
    buildMockScopeFacts({
      replyChannels: [{ tool: 'SendMessage', field: 'cc', recipient: 'lead' }],
    }),
  ]);

  expect(merged.replyChannels).toStrictEqual([
    { tool: 'SendMessage', field: 'to', recipient: 'lead' },
    { tool: 'SendMessage', field: 'cc', recipient: 'lead' },
  ]);
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
    paths: [],
    replyChannels: [],
  });
});
