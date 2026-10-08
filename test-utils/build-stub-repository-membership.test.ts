import { expect, test } from 'bun:test';
import { buildStubRepositoryMembership } from './build-stub-repository-membership.ts';

test.each([
  ['the repository root', '/repo', true],
  ['a path below the root', '/repo/.worktrees/feat', true],
  ['a sibling that shares the name prefix', '/repository', false],
  ['a path in another repository', '/other/.worktrees/x', false],
])('it places %s in the repository: %p', (_label, path, expected) => {
  expect(buildStubRepositoryMembership('/repo').isInRepository(path)).toBe(expected);
});
