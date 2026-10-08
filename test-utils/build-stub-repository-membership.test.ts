import { expect, test } from 'bun:test';
import { buildStubRepositoryMembership } from './build-stub-repository-membership.ts';

test.each([
  ['places the repository root in the repository', '/repo', true],
  ['places a path below the root in the repository', '/repo/.worktrees/feat', true],
  ['keeps a sibling that shares the name prefix out of the repository', '/repository', false],
  ['keeps a path in another repository out of the repository', '/other/.worktrees/x', false],
])('it %s', (_label, path, expected) => {
  expect(buildStubRepositoryMembership('/repo').isInRepository(path)).toBe(expected);
});
