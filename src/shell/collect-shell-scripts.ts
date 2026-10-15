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
      const descriptor = range === undefined ? null : findScriptDescriptor(range.text);

      const isScript =
        range !== undefined &&
        descriptor !== null &&
        findDescriptorSource(tokens, range.start, range.end, descriptor) === token.opener &&
        (token.isQuoted || token.substitutions.length === 0);

      const bodies = isScript ? [...token.substitutions, token.body] : token.substitutions;

      return bodies.map((body) => ({ text: body, segment }));
    }),
  ];
}

// The redirection that feeds a descriptor, as the offset where it starts, or
// null when none does. Redirections apply in order, `<&3` copies whatever
// descriptor 3 holds at that point, and a process substitution is a word.
function findDescriptorSource(
  tokens: ShellTokens['tokens'],
  start: number,
  end: number,
  descriptor: string,
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
    const assigned = number === '' ? implied : String(Number(number));
    const move = /^(?<source>\d+)(?<close>-?)$/u.exec(token.target ?? '')?.groups;

    const path =
      operator === '<' || operator === '<>' ? findPathDescriptor(token.target ?? '') : null;

    if (operator.endsWith('&') && move !== undefined) {
      const source = String(Number(move['source']));

      descriptors.set(assigned, descriptors.get(source) ?? null);

      if (move['close'] === '-') {
        descriptors.delete(source);
      }
    } else if (path === null) {
      descriptors.set(assigned, token.start);
    } else {
      descriptors.set(assigned, descriptors.get(path) ?? null);
    }
  }

  return descriptors.get(descriptor) ?? null;
}

const STANDARD_PATHS: ReadonlyMap<string, string> = new Map([
  ['/dev/stdin', '0'],
  ['/dev/stdout', '1'],
  ['/dev/stderr', '2'],
]);

// A path that opens a descriptor the shell already holds, as that descriptor.
function findPathDescriptor(path: string): string | null {
  const descriptor = /^\/(?:dev|proc\/self)\/fd\/(?<number>\d+)$/u.exec(path)?.groups?.['number'];

  if (descriptor !== undefined) {
    return String(Number(descriptor));
  }

  return STANDARD_PATHS.get(path) ?? null;
}

const SHELLS: ReadonlySet<string> = new Set(['bash', 'sh', 'zsh', 'dash', 'ksh']);

// These options take the next word as their value, not as a script file.
const VALUE_OPTIONS: ReadonlySet<string> = new Set(['--rcfile', '--init-file', '--emulate']);

const VALUE_OPTION_GROUP = /^[-+][^-]*[oO]$/u;

// The descriptor a shell reads its script from, or null when it runs a `-c`
// string or a script file that is no open descriptor. With `-s` the arguments
// after the options are positional parameters, and the script comes from input.
function findScriptDescriptor(segment: string): string | null {
  const [program = '', ...args] = splitCommandWords(segment);

  if (!SHELLS.has(basename(program))) {
    return null;
  }

  let readsInput = false;
  let index = 0;

  while (index < args.length) {
    const arg = args[index] ?? '';

    if (/^-[^-]*c/u.test(arg)) {
      return null;
    }

    if (arg === '--' || arg === '-') {
      const script = args[index + 1];

      return readsInput || script === undefined ? '0' : findPathDescriptor(script);
    }

    if (!/^[-+]/u.test(arg)) {
      return readsInput ? '0' : findPathDescriptor(arg);
    }

    readsInput ||= /^-[^-]*s/u.test(arg);
    index += VALUE_OPTIONS.has(arg) || VALUE_OPTION_GROUP.test(arg) ? 2 : 1;
  }

  return '0';
}
