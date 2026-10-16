import { expect, test } from 'bun:test';
import { isProtectedBranch } from './is-protected-branch.ts';

test.each([
  ['staging', ['staging'], true],
  ['release/2.0', ['release/*'], true],
  ['release/2.0/hotfix', ['release/*'], false],
  ['release/2.0/hotfix', ['release/**'], true],
  ['feat/release', ['release/*'], false],
  ['staging', [], false],
  ['release/{1,2}', ['release/{1,2}'], true],
  ['release/1', ['release/{1,2}'], false],
  ['release/a', ['release/**/*'], true],
  ['release/a/b', ['release/**/*'], true],
  ['v1.x', ['v?.x'], true],
  ['v1/x', ['v1?x'], false],
  ['hotfix-a', ['hotfix-[ab]'], true],
  ['hotfix-c', ['hotfix-[!ab]'], true],
  ['hotfix-a', ['hotfix-[!ab]'], false],
  ['v1x0', ['v1.0'], false],
  ['release/-', [String.raw`release/[a\-z]`], true],
  ['release/m', [String.raw`release/[a-\z]`], true],
  ['release/]', [String.raw`release/[\]]`], true],
  ['release/a/b', ['release[/]a/b'], false],
  ['release/[x', ['release/[x'], true],
  ['feat/x', ['release/[z-a]*'], false],
  ['release/m', ['release/[z-a]*', 'release/*'], true],
  ['release/b', ['release/[!z-a]'], true],
  ['release/-', ['release/[-a]'], true],
])('it reads %s against the patterns %j as protected: %p', (branch, patterns, expected) => {
  expect(isProtectedBranch(branch, patterns)).toBe(expected);
});
