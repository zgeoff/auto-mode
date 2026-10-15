import { expect, test } from 'bun:test';
import { collectShellScripts } from './collect-shell-scripts.ts';

test('it gives each substitution body with the segment that runs it', () => {
  expect(collectShellScripts('cd app && echo $(make) && ls `pwd`')).toStrictEqual([
    { text: 'make', segment: 1 },
    { text: 'pwd', segment: 2 },
  ]);
});

test.each([
  ['bash', "bash <<'EOF'\nrm x\nEOF"],
  ['a shell named by its path', '/bin/sh <<EOF\nrm x\nEOF'],
  ['a shell with options', "bash -e -o pipefail <<'EOF'\nrm x\nEOF"],
  ['a shell told to read its input', "bash -s build.sh <<'EOF'\nrm x\nEOF"],
  ['a shell given the heredoc on descriptor 0', "bash 0<<'EOF'\nrm x\nEOF"],
  ['a shell after its last option', "bash -x -- <<'EOF'\nrm x\nEOF"],
])('it reads a heredoc that %s runs as a script', (_label, command) => {
  expect(collectShellScripts(command)).toStrictEqual([{ text: 'rm x\n', segment: 0 }]);
});

test.each([
  ['a program that is no shell', 'cat <<EOF\nrm x\nEOF'],
  ['a shell that runs its -c argument', "bash -c 'cat' <<EOF\nrm x\nEOF"],
  ['a shell that runs a script file', "bash build.sh <<'EOF'\nrm x\nEOF"],
  ['a shell that runs a script file after its options', "sh -e -- build.sh <<'EOF'\nrm x\nEOF"],
  ['a shell on descriptor 3', "bash 3<<'EOF'\nrm x\nEOF"],
])('it reads no script from a heredoc fed to %s', (_label, command) => {
  expect(collectShellScripts(command)).toStrictEqual([]);
});

test('it reads only the substitutions of an unquoted heredoc that a shell runs', () => {
  expect(collectShellScripts('bash <<EOF\ncd /srv\necho $(make)\nEOF')).toStrictEqual([
    { text: 'make', segment: 0 },
  ]);
});

test('it gives a substitution in an unquoted heredoc body with the segment that opened it', () => {
  expect(collectShellScripts('ls; cat <<EOF\n$(make)\nEOF')).toStrictEqual([
    { text: 'make', segment: 1 },
  ]);
});
