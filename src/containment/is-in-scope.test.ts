import { expect, test } from 'bun:test';
import { buildMockOwnedScope } from '../../test-utils/factories/build-mock-owned-scope.ts';
import { isInScope } from './is-in-scope.ts';

test.each([
  ['a path inside an owned worktree', '/repo/.worktrees/a/src/x.ts', true],
  ['the owned worktree itself', '/repo/.worktrees/a', true],
  ['a sibling worktree', '/repo/.worktrees/b/x.ts', false],
  ['a path whose name only starts like the worktree', '/repo/.worktrees/ab/x.ts', false],
  ['a scratch path', '/scratch/build/x', true],
  ['a path a configured glob matches', '/data/cache/x.json', true],
])('it reads %s as in scope: %p', (_label, path, expected) => {
  expect(
    isInScope(
      path,
      buildMockOwnedScope({ worktrees: ['/repo/.worktrees/a'], pathGlobs: ['/data/cache/*.json'] }),
      ['/scratch'],
    ),
  ).toBe(expected);
});

test('it keeps a worktree nested under an owned checkout out of its scope', () => {
  expect(
    isInScope('/repo/.worktrees/other/x.ts', buildMockOwnedScope({ worktrees: ['/repo'] }), []),
  ).toBe(false);
});

test('it reads a nested worktree the task also owns as in scope', () => {
  expect(
    isInScope(
      '/repo/.worktrees/a/x.ts',
      buildMockOwnedScope({ worktrees: ['/repo', '/repo/.worktrees/a'] }),
      [],
    ),
  ).toBe(true);
});
