import { expect, test } from 'bun:test';
import { collectShellScripts } from './collect-shell-scripts.ts';
import { parseShellCommand } from './parse-shell-command.ts';

test('it gives each substitution body with the segment that runs it', () => {
  expect(
    collectShellScripts(parseShellCommand('cd app && echo $(make) && ls `pwd`')),
  ).toStrictEqual([
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
  ['a shell given the heredoc on a zero-padded descriptor 0', "bash 00<<'EOF'\nrm x\nEOF"],
  ['a shell after its last option', "bash -x -- <<'EOF'\nrm x\nEOF"],
  ['a shell with a grouped option value', "bash -euo pipefail <<'EOF'\nrm x\nEOF"],
  ['a shell whose script file is standard input', "bash /dev/stdin <<'EOF'\nrm x\nEOF"],
  ['a shell whose input copies descriptor 3', "bash 3<<'EOF' <&3\nrm x\nEOF"],
  ['a shell given two heredocs, from the last', "bash <<'A' <<'B'\nls\nA\nrm x\nB"],
  ['a shell whose input moves from descriptor 3', "bash <<'EOF' 3<&0 <&3-\nrm x\nEOF"],
  ['a shell whose input reopens /dev/stdin', "bash <<'EOF' < /dev/stdin\nrm x\nEOF"],
  ['a shell whose script path opens descriptor 3', "bash /dev/fd/3 3<<'EOF'\nrm x\nEOF"],
  ['zsh after an emulation value', "zsh --emulate sh <<'EOF'\nrm x\nEOF"],
  [
    'a shell whose input reopens /dev/stdin for writing too',
    "bash <<'EOF' <> /dev/stdin\nrm x\nEOF",
  ],
  ['a shell whose script path is /dev/stderr', "bash /dev/stderr 2<<'EOF'\nrm x\nEOF"],
])('it reads a heredoc that %s runs as a script', (_label, command) => {
  expect(collectShellScripts(parseShellCommand(command))).toStrictEqual([
    { text: 'rm x\n', segment: 0 },
  ]);
});

test.each([
  ['a program that is no shell', 'cat <<EOF\nrm x\nEOF'],
  ['a shell that runs its -c argument', "bash -c 'cat' <<EOF\nrm x\nEOF"],
  ['a shell that runs a script file', "bash build.sh <<'EOF'\nrm x\nEOF"],
  ['a shell that runs a script file after its options', "sh -e -- build.sh <<'EOF'\nrm x\nEOF"],
  ['a shell on descriptor 3', "bash 3<<'EOF'\nrm x\nEOF"],
  ['a shell whose script path opens another descriptor', "bash /dev/fd/4 3<<'EOF'\nrm x\nEOF"],
  ['a shell with an attached option value', "zsh -f -oNO_RCS build.sh <<'EOF'\nrm x\nEOF"],
])('it reads no script from a heredoc fed to %s', (_label, command) => {
  expect(collectShellScripts(parseShellCommand(command))).toStrictEqual([]);
});

test('it reads only the substitutions of an unquoted heredoc that a shell runs', () => {
  expect(
    collectShellScripts(parseShellCommand('bash <<EOF\ncd /srv\necho $(make)\nEOF')),
  ).toStrictEqual([{ text: 'make', segment: 0 }]);
});

test('it gives a substitution in an unquoted heredoc body with the segment that opened it', () => {
  expect(collectShellScripts(parseShellCommand('ls; cat <<EOF\n$(make)\nEOF'))).toStrictEqual([
    { text: 'make', segment: 1 },
  ]);
});

test.each([
  ['a bare substitution', 'echo $(git log)', ['git log']],
  ['a backtick', 'echo `git log`', ['git log']],
  ['a substitution inside double quotes', 'echo "$(git log)"', ['git log']],
  ['a closing parenthesis inside quotes', "out=$(echo ')'; git log)", ["echo ')'; git log"]],
  ['a nested substitution, once', 'echo $(a $(b))', ['a $(b)']],
  ['a substitution inside a parameter default', `echo \${x:-$(git log)}`, ['git log']],
  ['a quote inside a parameter', `echo "\${x:-"it's"}" $(git log)`, ['git log']],
  ['single quotes in a parameter inside double quotes', `echo "\${x:-'$(git log)'}"`, ['git log']],
  ['a process substitution', 'diff <(git log) b', ['git log']],
  ['a substitution after a word-joined one', 'ref=$(a)#L1 && echo $(b)', ['a', 'b']],
  ['an ANSI quote with an escaped quote', String.raw`echo $'it\'s' $(git log)`, ['git log']],
  [
    'a backtick whose body holds a quote',
    "echo `echo it's` $(git log) 'x'",
    ["echo it's", 'git log'],
  ],
  ['an unclosed quote before a substitution', "echo it's $(git log)", ['git log']],
  ['an arithmetic command', '(( 1 << $(git log) ))', ['git log']],
  ['an arithmetic expansion', 'echo $((1 << $(git log)))', ['git log']],
  ['an arithmetic command after a nested expansion', '(( 1 + $((2)) << $(git log) ))', ['git log']],
  [
    'an arithmetic expansion after a nested expansion',
    'echo $((1 + $((2)) << $(git log)))',
    ['git log'],
  ],
  [
    'an arithmetic expansion after a quoted parenthesis',
    "echo $((1 + $(printf ')') << $(git log)))",
    ["printf ')'", 'git log'],
  ],
  ['a $(( whose body does not end in ))', 'echo $((cd app); make)', ['(cd app); make']],
  ['a $(( that holds two subshells', 'echo $((cd app); make; (ls))', ['(cd app); make; (ls)']],
  ['a here-string, which bash expands', 'cat <<<"$(git log)"', ['git log']],
  ['an unquoted heredoc', "cat <<EOF\nit's $(git log)\nEOF", ['git log']],
  ['a heredoc that strips tabs', 'cat <<-EOF\n\t$(git log)\n\tEOF', ['git log']],
  [
    'a heredoc whose delimiter follows a line continuation',
    'cat <<\\\nEOF\n$(git log)\nEOF',
    ['git log'],
  ],
  [
    'a heredoc delimiter split by a line continuation, which stays unquoted',
    'cat <<EO\\\nF\n$(git log)\nEOF',
    ['git log'],
  ],
  [
    'a quoted heredoc inside a substitution',
    `git commit -m "$(cat <<'EOF'\nDon't stop\nEOF\n)" && echo $(git log)`,
    ["cat <<'EOF'\nDon't stop\nEOF\n", 'git log'],
  ],
  ['a loop word list', 'for f in $(git ls-files); do echo "$f"; done', ['git ls-files']],
  ['a test command', '[[ -n $(git status --short) ]]', ['git status --short']],
])('it collects the body of %s', (_label, command, bodies) => {
  expect(
    collectShellScripts(parseShellCommand(command)).map((script) => script.text),
  ).toStrictEqual(bodies);
});

test.each([
  ['single quotes', "echo '$(git log)'"],
  ['an escaped dollar sign', String.raw`echo \$(git log)`],
  ['an escaped dollar sign inside double quotes', String.raw`echo "\$(git log)"`],
  ['escaped backticks inside double quotes', 'echo "\\`git log\\`"'],
  ['an escaped dollar sign before an ANSI quote', String.raw`echo \$'a\' 'b'`],
  ['a comment', 'echo ok # $(git log)'],
  ['a comment after a continued line', 'echo ok;\\\n# $(git log)'],
  ['a quoted heredoc', "cat <<'EOF'\n$(git log)\nEOF"],
  [
    'a heredoc whose single-quoted delimiter holds a line continuation',
    "cat <<'EO\\\nF'\nEOF\n$(git log)",
  ],
  [
    'a heredoc delimiter that holds a double-quoted substitution',
    'cat <<"$(git log)"\nnotes\n$(git log)',
  ],
  ['a heredoc delimiter that holds a bare substitution', 'cat <<-$(git log)\nnotes\n$(git log)'],
  ['a heredoc delimiter that holds a backtick', 'cat <<`git log`\nnotes\n`git log`'],
])('it collects no substitution from %s', (_label, command) => {
  expect(collectShellScripts(parseShellCommand(command))).toStrictEqual([]);
});

test('it gives a substitution inside a subshell with the segment that runs it', () => {
  expect(collectShellScripts(parseShellCommand('ls; (cd app && echo $(make))'))).toStrictEqual([
    { text: 'make', segment: 2 },
  ]);
});
