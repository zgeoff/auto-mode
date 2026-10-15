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

  return [
    ...segments.flatMap((range, segment) =>
      splitShellTokens(range.text).substitutions.map((body) => ({ text: body, segment })),
    ),
    ...splitShellTokens(command).tokens.flatMap((token) => {
      if (token.kind !== 'heredoc') {
        return [];
      }

      const segment = segments.findIndex(
        (range) => range.start <= token.opener && token.opener < range.end,
      );

      const bodies = isShellScript(segments[segment]?.text ?? '')
        ? [...token.substitutions, token.body]
        : token.substitutions;

      return bodies.map((body) => ({ text: body, segment }));
    }),
  ];
}

const SHELLS: ReadonlySet<string> = new Set(['bash', 'sh', 'zsh', 'dash', 'ksh']);

// With `-c` the shell runs its argument, and the heredoc is only its input.
function isShellScript(segment: string): boolean {
  const [program = '', ...args] = splitCommandWords(segment);

  return SHELLS.has(basename(program)) && !args.some((arg) => /^-\w*c/u.test(arg));
}
