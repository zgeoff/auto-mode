import { resolveShellPath } from './resolve-shell-path.ts';
import { splitCommandWords } from './split-command-words.ts';
import type { ShellCommandTree, ShellRedirect, ShellScope } from './types.ts';

export interface ShellCommand {
  readonly words: readonly string[];
  readonly directory: string | null;
  readonly directories: readonly (string | null)[];
  readonly writeTargets: readonly string[];
}

interface ScopeDirectories {
  readonly scope: ShellScope | null;
  directories: (string | null)[];
}

// A `cd` in a subshell ends with it. One in a compound command's body may not
// run, so after that body the shell may be in any directory the body or the
// skipped body leaves. `directory` is null unless only one is possible.
export function collectShellCommands(
  tree: ShellCommandTree,
  cwd: string | null,
  home: string,
): ShellCommand[] {
  const stack: ScopeDirectories[] = [{ scope: null, directories: [cwd] }];

  return tree.segments.map((segment) => {
    let depth = 0;

    while (
      depth < segment.scopes.length &&
      stack[depth + 1]?.scope?.id === segment.scopes[depth]?.id
    ) {
      depth += 1;
    }

    while (stack.length > depth + 1) {
      const left = stack.pop();
      const parent = stack.at(-1);

      if (left?.scope?.kind === 'conditional' && parent !== undefined) {
        parent.directories = [...new Set([...parent.directories, ...left.directories])];
      }
    }

    for (const scope of segment.scopes.slice(depth)) {
      stack.push({ scope, directories: [...(stack.at(-1)?.directories ?? [null])] });
    }

    const current = stack.at(-1);
    const directories = current?.directories ?? [null];
    const words = splitCommandWords(segment.words);
    const directory = directories.length === 1 ? (directories[0] ?? null) : null;

    const entry = {
      words,
      directory,
      directories,
      writeTargets: collectWriteTargets(segment.redirects),
    };

    // A `cd` inside a pipeline runs in a subshell.
    if (words[0] === 'cd' && current !== undefined) {
      current.directories = [
        ...new Set(directories.map((from) => resolveCD(from, words[1], tree.hasPipe, home))),
      ];
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

function resolveCD(
  from: string | null,
  target: string | undefined,
  isPiped: boolean,
  home: string,
): string | null {
  return isPiped ? null : resolveShellPath(from, target ?? home, home);
}
