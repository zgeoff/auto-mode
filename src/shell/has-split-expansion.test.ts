import { expect, test } from 'bun:test';
import { hasSplitExpansion } from './has-split-expansion.ts';

test.each([
  ['an unquoted variable', '$FLAGS', true],
  ['an unquoted variable after a quoted part', '"origin/"$BRANCH', true],
  ['an unquoted variable after an option name', '--message=$MSG', true],
  ['an unquoted command substitution', '$(cat .push-flags)', true],
  ['a backtick substitution', '`cat .push-flags`', true],
  // oxlint-disable-next-line no-template-curly-in-string -- the shell spelling, not a template
  ['an unquoted braced variable', '${FLAGS}', true],
  ['a variable after a quoted substitution', '"$(echo "$(date)")"$X', true],
  ['a substitution that never closes', '"$(cat msg.txt', true],
  ['a variable in double quotes', '"$FLAGS"', false],
  ['a command substitution in double quotes', '"$(cat msg.txt)"', false],
  ['a substitution whose body holds a closing parenthesis in quotes', '"$(echo ")" )"', false],
  [
    'a quoted heredoc substitution with an apostrophe',
    "\"$(cat <<'EOF'\nfix: don't (break) parsing\nEOF\n)\"",
    false,
  ],
  ['a quoted substitution after an option name', '--message="$(cat msg.txt)"', false],
  // oxlint-disable-next-line no-template-curly-in-string -- the shell spelling, not a template
  ['a braced variable in double quotes after a short option', '-m"${MSG}"', false],
  ['a variable in single quotes', "'$FLAGS'", false],
  ['a variable in an ANSI-C quote', "$'$FLAGS'", false],
  ['an escaped dollar sign', String.raw`\$FLAGS`, false],
  ['a plain word', 'feat/queue-filters', false],
])('it reads %s as an expansion the shell splits: %p', (_label, raw, expected) => {
  expect(hasSplitExpansion(raw)).toBe(expected);
});
