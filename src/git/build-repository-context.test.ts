import { expect, test } from 'bun:test';
import { buildRepositoryContext } from './build-repository-context.ts';

test('it builds the context from the checkout facts without the user info a remote URL holds', () => {
  const context = buildRepositoryContext({
    cwd: '/w/app',
    checkout: { worktree: '/w/app', gitDir: '/w/app/.git', commonDir: '/w/app/.git' },
    head: { branch: 'feature', defaultBranch: 'main' },
    remotes: [
      { name: 'origin', url: 'https://user:token@github.com/dev/app.git?x=1#y' },
      { name: 'fork', url: 'token@github.com:dev/fork.git' },
      { name: 'broken', url: 'https://[bad' },
    ],
  });

  expect(context).toStrictEqual({
    cwd: '/w/app',
    branch: 'feature',
    defaultBranch: 'main',
    remotes: [
      { name: 'origin', url: 'https://github.com/dev/app.git' },
      { name: 'fork', url: 'github.com:dev/fork.git' },
    ],
  });
});

test('it builds no context when HEAD could not be read', () => {
  const context = buildRepositoryContext({
    cwd: '/w/app',
    checkout: { worktree: '/w/app', gitDir: '/w/app/.git', commonDir: '/w/app/.git' },
    head: null,
    remotes: [],
  });

  expect(context).toBeNull();
});
