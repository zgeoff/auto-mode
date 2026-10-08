import { expect, test } from 'bun:test';
import { buildMockScopeSourceContext } from './build-mock-scope-source-context.ts';

test('it builds a default scope source context', () => {
  const context = buildMockScopeSourceContext();

  expect(context).toStrictEqual({
    env: {},
    sessionID: expect.toBeString(),
    cwd: context.worktree,
    worktree: expect.toStartWith('/'),
    commonDir: `${context.worktree}/.git`,
    branch: expect.toBeString(),
    stateDir: expect.toStartWith('/'),
    stderr: { write: expect.toBeFunction() },
  });
});

test('it applies overrides on top of the defaults', () => {
  const context = buildMockScopeSourceContext({
    sessionID: 'session-1',
    cwd: '/repo/src',
    worktree: '/repo',
    commonDir: null,
    branch: null,
    atcRecordPath: '/state/record.json',
  });

  expect(context).toStrictEqual({
    env: {},
    sessionID: 'session-1',
    cwd: '/repo/src',
    worktree: '/repo',
    commonDir: null,
    branch: null,
    stateDir: expect.toStartWith('/'),
    atcRecordPath: '/state/record.json',
    stderr: { write: expect.toBeFunction() },
  });
});

test('it derives the cwd and the git directory from an overridden worktree', () => {
  const context = buildMockScopeSourceContext({ worktree: '/repo' });

  expect(context).toStrictEqual({
    env: {},
    sessionID: expect.toBeString(),
    cwd: '/repo',
    worktree: '/repo',
    commonDir: '/repo/.git',
    branch: expect.toBeString(),
    stateDir: expect.toStartWith('/'),
    stderr: { write: expect.toBeFunction() },
  });
});
