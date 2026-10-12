import { expect, test } from 'bun:test';
import { isUnresolvedWord } from './is-unresolved-word.ts';

test.each([
  ['a variable', '$BRANCH', true],
  // oxlint-disable-next-line no-template-curly-in-string -- the shell spelling, not a template
  ['a braced variable', 'feat/${NAME}', true],
  ['a backtick substitution', '`git branch`', true],
  ['a plain word', 'feat/a', false],
])('it reads %s as unresolved: %p', (_label, word, expected) => {
  expect(isUnresolvedWord(word)).toBe(expected);
});
