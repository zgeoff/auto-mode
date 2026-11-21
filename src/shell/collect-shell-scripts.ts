import { basename } from 'node:path';
import { splitCommandWords } from './split-command-words.ts';
import type { ShellCommandTree, ShellRedirect } from './types.ts';

export interface ShellScript {
  readonly text: string;
  readonly segment: number;
}

export function collectShellScripts(tree: ShellCommandTree): ShellScript[] {
  const segments = tree.segments;

  return [
    ...segments.flatMap((range, segment) =>
      range.substitutions.map((body) => ({ text: body, segment })),
    ),
    ...segments.flatMap((range, segment) =>
      range.redirects.flatMap((redirect) => {
        const heredoc = redirect.heredoc;

        if (heredoc === null) {
          return [];
        }

        // The outer shell expands an unquoted body before the inner one reads
        // it, and the output of a substitution can be any script text.
        const descriptor = findScriptDescriptor(splitCommandWords(range.words));

        const isScript =
          descriptor !== null &&
          findDescriptorSource(range.redirects, descriptor) === redirect.start &&
          (heredoc.isQuoted || heredoc.substitutions.length === 0);

        const bodies = isScript ? [...heredoc.substitutions, heredoc.body] : heredoc.substitutions;

        return bodies.map((body) => ({ text: body, segment }));
      }),
    ),
  ];
}

const SHELLS: ReadonlySet<string> = new Set(['bash', 'sh', 'zsh', 'dash', 'ksh']);

// These options take the next word as their value, not as a script file.
const VALUE_OPTIONS: ReadonlySet<string> = new Set(['--rcfile', '--init-file', '--emulate']);

const VALUE_OPTION_GROUP = /^[-+][^-]*[oO]$/u;

function findScriptDescriptor(words: readonly string[]): number | null {
  const [program = '', ...args] = words;

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

      return readsInput || script === undefined ? 0 : findPathDescriptor(script);
    }

    if (!/^[-+]/u.test(arg)) {
      return readsInput ? 0 : findPathDescriptor(arg);
    }

    // With `-s` the arguments after the options are positional parameters, and
    // the script comes from input.
    readsInput ||= /^-[^-]*s/u.test(arg);
    index += VALUE_OPTIONS.has(arg) || VALUE_OPTION_GROUP.test(arg) ? 2 : 1;
  }

  return 0;
}

const STANDARD_PATHS: ReadonlyMap<string, number> = new Map([
  ['/dev/stdin', 0],
  ['/dev/stdout', 1],
  ['/dev/stderr', 2],
]);

function findPathDescriptor(path: string): number | null {
  const descriptor = /^\/(?:dev|proc\/self)\/fd\/(?<number>\d+)$/u.exec(path)?.groups?.['number'];

  if (descriptor !== undefined) {
    return Number(descriptor);
  }

  return STANDARD_PATHS.get(path) ?? null;
}

// Redirections apply in order, and `<&3` copies whatever descriptor 3 holds at
// that point.
function findDescriptorSource(
  redirects: readonly ShellRedirect[],
  descriptor: number,
): number | null {
  const descriptors = new Map<number, number | null>();

  for (const redirect of redirects) {
    const operator = redirect.operator;
    const assigned = redirect.descriptor ?? (operator.startsWith('<') ? 0 : 1);
    const move = /^(?<source>\d+)(?<close>-?)$/u.exec(redirect.target ?? '')?.groups;

    const path =
      operator === '<' || operator === '<>' ? findPathDescriptor(redirect.target ?? '') : null;

    if (operator.endsWith('&') && move !== undefined) {
      const source = Number(move['source']);

      descriptors.set(assigned, descriptors.get(source) ?? null);

      if (move['close'] === '-') {
        descriptors.delete(source);
      }
    } else if (path === null) {
      descriptors.set(assigned, redirect.start);
    } else {
      descriptors.set(assigned, descriptors.get(path) ?? null);
    }
  }

  return descriptors.get(descriptor) ?? null;
}
