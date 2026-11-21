import { resolveShellPath } from './resolve-shell-path.ts';
import { splitCommandWords } from './split-command-words.ts';
import type { ShellCommandTree, ShellRedirect, ShellScope } from './types.ts';

export interface ShellCommand {
  readonly words: readonly string[];
  readonly directory: string | null;
  readonly writeTargets: readonly string[];
}

interface ScopeDirectory {
  readonly scope: ShellScope | null;
  directory: string | null;
}

// A `cd` in a subshell ends with it. One in a compound command's body may not
// run, so the directory after that body stays the one before it.
export function collectShellCommands(
  tree: ShellCommandTree,
  cwd: string | null,
  home: string,
): ShellCommand[] {
  const stack: ScopeDirectory[] = [{ scope: null, directory: cwd }];

  return tree.segments.map((segment) => {
    let depth = 0;

    while (
      depth < segment.scopes.length &&
      stack[depth + 1]?.scope?.id === segment.scopes[depth]?.id
    ) {
      depth += 1;
    }

    stack.length = depth + 1;

    for (const scope of segment.scopes.slice(depth)) {
      stack.push({ scope, directory: stack.at(-1)?.directory ?? null });
    }

    const current = stack.at(-1);
    const words = splitCommandWords(segment.words);

    const entry = {
      words,
      directory: current?.directory ?? null,
      writeTargets: collectWriteTargets(segment.redirects),
    };

    // A `cd` inside a pipeline runs in a subshell.
    if (words[0] === 'cd' && current !== undefined) {
      current.directory = tree.hasPipe
        ? null
        : resolveShellPath(current.directory, words[1] ?? home, home);
    }

    return entry;
  });
}

// `>&2` and `2>&1` duplicate a descriptor and write no file, and an input
// redirection writes none either.
const WRITE_REDIRECTS: ReadonlySet<string> = new Set(['>', '>>', '>|', '&>', '&>>']);

function collectWriteTargets(redirects: readonly ShellRedirect[]): string[] {
  return redirects.flatMap((redirect) =>
    redirect.target !== null && redirect.target !== '' && WRITE_REDIRECTS.has(redirect.operator)
      ? [redirect.target]
      : [],
  );
}
