import { expect, test } from 'bun:test';
import { isProtectedBranch } from './is-protected-branch.ts';

test.each([
  ['staging', ['staging'], true],
  ['release/2.0', ['release/*'], true],
  ['release/2.0/hotfix', ['release/*'], false],
  ['release/2.0/hotfix', ['release/**'], true],
  ['feat/release', ['release/*'], false],
  ['staging', [], false],
])('it reads %s against the patterns %j as protected: %p', (branch, patterns, expected) => {
  expect(isProtectedBranch(branch, patterns)).toBe(expected);
});
