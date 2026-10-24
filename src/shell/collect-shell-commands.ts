import { resolveShellPath } from './resolve-shell-path.ts';
import { splitCommandWords } from './split-command-words.ts';
import { splitShellCommand } from './split-shell-command.ts';
import { splitShellTokens } from './split-shell-tokens.ts';

export interface ShellCommand {
  readonly words: readonly string[];
  readonly directory: string | null;
  readonly writeTargets: readonly string[];
}

export function collectShellCommands(
  command: string,
  cwd: string | null,
  home: string,
): ShellCommand[] {
  const hasPipe = splitShellTokens(command).tokens.some(
    (token) => token.kind === 'separator' && token.operator === '|',
  );

  let directory: string | null = cwd;

  return splitShellCommand(command).segments.map((segment) => {
    const words = splitCommandWords(segment.text);
    const entry = { words, directory, writeTargets: collectWriteTargets(segment.text) };

    // A `cd` inside a pipeline runs in a subshell.
    if (words[0] === 'cd') {
      directory = hasPipe ? null : resolveShellPath(directory, words[1] ?? home, home);
    }

    return entry;
  });
}

// `>&2` and `2>&1` duplicate a descriptor and write no file, and an input
// redirection writes none either.
const WRITE_REDIRECTS: ReadonlySet<string> = new Set(['>', '>>', '>|', '&>', '&>>']);

function collectWriteTargets(text: string): string[] {
  return splitShellTokens(text).tokens.flatMap((token) =>
    token.kind === 'redirect' &&
    token.target !== null &&
    token.target !== '' &&
    WRITE_REDIRECTS.has(token.operator.replace(/^\d+/u, ''))
      ? [token.target]
      : [],
  );
}
