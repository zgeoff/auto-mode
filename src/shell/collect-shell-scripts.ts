import { basename } from 'node:path';
import { splitCommandWords } from './split-command-words.ts';
import { splitShellCommand } from './split-shell-command.ts';
import type { ShellTokens } from './split-shell-tokens.ts';
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

      const range = segments[segment];

      // The outer shell expands an unquoted body before the inner one reads
      // it, and the output of a substitution can be any script text.
      const isScript =
        range !== undefined &&
        isShellScript(range.text) &&
        findStandardInput(tokens, range.start, range.end) === token.opener &&
        (token.isQuoted || token.substitutions.length === 0);

      const bodies = isScript ? [...token.substitutions, token.body] : token.substitutions;

      return bodies.map((body) => ({ text: body, segment }));
    }),
  ];
}

// The redirection that feeds descriptor 0, as the offset where it starts, or
// null when none does. Redirections apply in order, `<&3` copies whatever
// descriptor 3 holds at that point, and a process substitution is a word.
function findStandardInput(
  tokens: ShellTokens['tokens'],
  start: number,
  end: number,
): number | null {
  const descriptors = new Map<string, number | null>();

  for (const token of tokens) {
    if (
      token.kind !== 'redirect' ||
      token.operator.endsWith('(') ||
      token.start < start ||
      token.start >= end
    ) {
      continue;
    }

    const number = /^\d*/u.exec(token.operator)?.[0] ?? '';
    const operator = token.operator.slice(number.length);
    const implied = operator.startsWith('<') ? '0' : '1';
    const descriptor = number === '' ? implied : String(Number(number));

    if (operator.endsWith('&') && token.target !== null && /^\d+$/u.test(token.target)) {
      const source = String(Number(token.target));

      descriptors.set(descriptor, descriptors.get(source) ?? null);
    } else {
      descriptors.set(descriptor, token.start);
    }
  }

  return descriptors.get('0') ?? null;
}

const SHELLS: ReadonlySet<string> = new Set(['bash', 'sh', 'zsh', 'dash', 'ksh']);

// These options take the next word as their value, not as a script file.
const VALUE_OPTIONS: ReadonlySet<string> = new Set(['--rcfile', '--init-file']);

const VALUE_OPTION_GROUP = /^[-+][^-]*[oO]/u;

// A script file that names standard input reads the heredoc after all.
const INPUT_PATHS: ReadonlySet<string> = new Set(['/dev/stdin', '/dev/fd/0', '/proc/self/fd/0']);

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
      return readsInput || index === args.length - 1 || INPUT_PATHS.has(args[index + 1] ?? '');
    }

    if (!/^[-+]/u.test(arg)) {
      return readsInput || INPUT_PATHS.has(arg);
    }

    readsInput ||= /^-[^-]*s/u.test(arg);
    index += VALUE_OPTIONS.has(arg) || VALUE_OPTION_GROUP.test(arg) ? 2 : 1;
  }

  return true;
}
