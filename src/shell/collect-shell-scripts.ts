import { basename } from 'node:path';
import { splitCommandWords } from './split-command-words.ts';
import { splitShellCommand } from './split-shell-command.ts';
import { splitShellTokens } from './split-shell-tokens.ts';

export interface ShellScript {
  readonly text: string;
  readonly segment: number;
}

// The commands a shell command runs that its own segments do not show: each
// substitution body, and each heredoc body a shell reads as its script. A
// script names the segment that runs it, counted as the shell split counts.
export function collectShellScripts(command: string): ShellScript[] {
  const segments = splitShellCommand(command).segments;
  const tokens = splitShellTokens(command).tokens;

  return [
    ...segments.flatMap((range, segment) =>
      splitShellTokens(range.text).substitutions.map((body) => ({ text: body, segment })),
    ),
    ...tokens.flatMap((token) => {
      if (token.kind !== 'heredoc') {
        return [];
      }

      const segment = segments.findIndex(
        (range) => range.start <= token.opener && token.opener < range.end,
      );

      const opener = tokens.find(
        (candidate) => candidate.kind === 'redirect' && candidate.start === token.opener,
      );

      // The outer shell expands an unquoted body before the inner one reads
      // it, and the output of a substitution can be any script text.
      const isScript =
        isShellScript(segments[segment]?.text ?? '') &&
        opener?.kind === 'redirect' &&
        /^0?<</u.test(opener.operator) &&
        (token.isQuoted || token.substitutions.length === 0);

      const bodies = isScript ? [...token.substitutions, token.body] : token.substitutions;

      return bodies.map((body) => ({ text: body, segment }));
    }),
  ];
}

const SHELLS: ReadonlySet<string> = new Set(['bash', 'sh', 'zsh', 'dash', 'ksh']);

// These options take the next word as their value, not as a script file.
const VALUE_OPTIONS: ReadonlySet<string> = new Set([
  '-o',
  '+o',
  '-O',
  '+O',
  '--rcfile',
  '--init-file',
]);

// A shell reads its script from standard input only when no argument names a
// script file or, with `-c`, the script itself. With `-s` the arguments after
// the options are positional parameters, and the script still comes from input.
function isShellScript(segment: string): boolean {
  const [program = '', ...args] = splitCommandWords(segment);

  if (!SHELLS.has(basename(program))) {
    return false;
  }

  let readsInput = false;
  let index = 0;

  while (index < args.length) {
    const arg = args[index] ?? '';

    if (/^-[^-]*c/u.test(arg)) {
      return false;
    }

    if (arg === '--' || arg === '-') {
      return readsInput || index === args.length - 1;
    }

    if (!/^[-+]/u.test(arg)) {
      return readsInput;
    }

    readsInput ||= /^-[^-]*s/u.test(arg);
    index += VALUE_OPTIONS.has(arg) ? 2 : 1;
  }

  return true;
}
