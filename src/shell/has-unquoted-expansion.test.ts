import { expect, test } from 'bun:test';
import { hasUnquotedExpansion } from './has-unquoted-expansion.ts';

test.each([
  ['an unquoted variable', '$KEY=/tmp/none', true],
  ['an unquoted variable after a quoted part', '"core."$NAME', true],
  ['an unquoted positional parameter', '$1', true],
  ['a backtick substitution', '`printf core.hooksPath`', true],
  ['a command substitution in double quotes', '"$(printf core.hooksPath)"', true],
  // oxlint-disable-next-line no-template-curly-in-string -- the shell spelling, not a template
  ['a braced variable in double quotes', '"${KEY}=/tmp/none"', true],
  ['a variable after an ANSI-C quote that holds an escaped quote', String.raw`$'\''$KEY`, true],
  ['a variable in double quotes', '"$KEY=/tmp/none"', false],
  ['a variable in single quotes', "'$KEY=/tmp/none'", false],
  ['a variable in an ANSI-C quote', "$'$KEY'", false],
  ['an escaped dollar sign', String.raw`\$KEY=/tmp/none`, false],
  ['a lone dollar sign', 'price=$', false],
  ['a plain word', 'core.hooksPath=/srv/harbor/.git/hooks', false],
])('it reads %s as an unquoted expansion: %p', (_label, raw, expected) => {
  expect(hasUnquotedExpansion(raw)).toBe(expected);
});
