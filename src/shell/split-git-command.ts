import { resolveShellPath } from './resolve-shell-path.ts';

export interface GitCommand {
  readonly directory: string | null;
  readonly args: readonly string[];
}

// Reads git's global options: `-C` moves the directory git runs in, and `-c`
// takes a value. The arguments left start at the subcommand.
export function splitGitCommand(
  args: readonly string[],
  directory: string | null,
  home: string,
): GitCommand {
  let gitDirectory = directory;
  let index = 0;

  while (index < args.length && args[index]?.startsWith('-') === true) {
    const option = args[index];

    if (option === '-C') {
      gitDirectory = resolveShellPath(gitDirectory, args[index + 1] ?? '', home);
    }

    index += option === '-C' || option === '-c' ? 2 : 1;
  }

  return { directory: gitDirectory, args: args.slice(index) };
}
