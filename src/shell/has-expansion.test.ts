import { expect, test } from 'bun:test';
import invariant from 'tiny-invariant';
import { hasExpansion } from './has-expansion.ts';
import { parseShellCommand } from './parse-shell-command.ts';

test.each([
  ['an unquoted variable', '$BRANCH', 'unquoted', true],
  ['an unquoted variable', '$BRANCH', 'any', true],
  ['a variable in double quotes', '"$BRANCH"', 'unquoted', false],
  ['a variable in double quotes', '"$BRANCH"', 'any', true],
  ['a command substitution in double quotes', '"$(cat .push-flags)"', 'any', true],
  ['a backtick substitution in double quotes', '"`cat .push-flags`"', 'any', true],
  ['a variable in single quotes', "'$BRANCH'", 'any', false],
  ['a variable in an ANSI-C quote', "$'$BRANCH'", 'any', false],
  ['an escaped dollar sign', String.raw`\$BRANCH`, 'any', false],
  ['an escaped dollar sign in double quotes', String.raw`"\$BRANCH"`, 'any', false],
  ['a single quote inside double quotes before a variable', `"it's $BRANCH"`, 'any', true],
  ['a lone dollar sign', 'price=$', 'any', false],
  ['a plain word', 'feat/queue-filters', 'any', false],
] as const)('it reads %s with reach %s as an expansion: %p', (_label, raw, reach, expected) => {
  const [word] = parseShellCommand(raw).segments.flatMap((segment) => segment.words);

  invariant(word !== undefined);

  expect(hasExpansion(word, reach)).toBe(expected);
});
