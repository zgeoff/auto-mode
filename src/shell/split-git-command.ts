import { resolveShellPath } from './resolve-shell-path.ts';

export interface GitConfigOption {
  readonly source: 'value' | 'environment';
  readonly setting: string;
}

export interface GitCommand {
  readonly directory: string | null;
  readonly config: readonly GitConfigOption[];
  readonly args: readonly string[];
}

const VALUED_GLOBALS: ReadonlySet<string> = new Set([
  '-C',
  '-c',
  '--config-env',
  '--git-dir',
  '--work-tree',
  '--namespace',
]);

// Reads git's global options: `-C` moves the directory git runs in, and `-c`
// and `--config-env` set a config value, in order. The arguments left start at
// the subcommand.
export function splitGitCommand(
  args: readonly string[],
  directory: string | null,
  home: string,
): GitCommand {
  let gitDirectory = directory;
  const config: GitConfigOption[] = [];
  let index = 0;

  while (index < args.length && args[index]?.startsWith('-') === true) {
    const option = args[index] ?? '';
    const value = args[index + 1] ?? '';

    if (option === '-C') {
      gitDirectory = resolveShellPath(gitDirectory, value, home);
    } else if (option === '-c') {
      config.push({ source: 'value', setting: value });
    } else if (option === '--config-env') {
      config.push({ source: 'environment', setting: value });
    } else if (option.startsWith('--config-env=')) {
      config.push({ source: 'environment', setting: option.slice('--config-env='.length) });
    }

    index += VALUED_GLOBALS.has(option) ? 2 : 1;
  }

  return { directory: gitDirectory, config, args: args.slice(index) };
}
