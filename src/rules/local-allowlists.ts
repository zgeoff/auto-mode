export const READ_ONLY_TOOLS: ReadonlySet<string> = new Set([
  'Read',
  'Glob',
  'Grep',
  'LS',
  'NotebookRead',
  'TodoWrite',
]);

export const SHELL_TOOLS: ReadonlySet<string> = new Set(['Bash']);

export const READ_ONLY_COMMANDS: ReadonlySet<string> = new Set([
  'basename',
  'cat',
  'cksum',
  'column',
  'comm',
  'cut',
  'date',
  'df',
  'diff',
  'dirname',
  'du',
  'echo',
  'false',
  'fd',
  'file',
  'find',
  'grep',
  'head',
  'hostname',
  'id',
  'jq',
  'ls',
  'md5sum',
  'nl',
  'od',
  'printenv',
  'printf',
  'ps',
  'pwd',
  'readlink',
  'realpath',
  'rg',
  'sha1sum',
  'sha256sum',
  'sort',
  'stat',
  'tail',
  'tr',
  'true',
  'type',
  'uname',
  'uniq',
  'uptime',
  'wc',
  'which',
  'whoami',
]);

export interface UnsafeOptions {
  // Short option letters, matched anywhere in a cluster such as `-uo`.
  readonly short?: readonly string[];

  // Long option names, matched by any prefix, because getopt_long accepts an
  // unambiguous prefix such as `--out` for `--output`.
  readonly long?: readonly string[];

  // Arguments matched whole, such as find's `-exec`.
  readonly words?: readonly string[];

  // The most operands the command takes before one names a file it writes.
  readonly operands?: number;

  // The options that take the next word as their value, short and long, so
  // the operand count skips that word.
  readonly valued?: { readonly short: readonly string[]; readonly long: readonly string[] };
}

// The options that make a read-only command run another command, write a file,
// or change the machine. A command allowed by name passes on when its
// arguments hold one of these.
export const UNSAFE_OPTIONS: ReadonlyMap<string, UnsafeOptions> = new Map([
  ['date', { short: ['s'], long: ['set'] }],
  ['fd', { short: ['x', 'X'], long: ['exec', 'exec-batch'] }],
  ['file', { short: ['C'], long: ['compile'] }],
  [
    'find',
    {
      words: [
        '-delete',
        '-exec',
        '-execdir',
        '-fls',
        '-fprint',
        '-fprint0',
        '-fprintf',
        '-ok',
        '-okdir',
      ],
    },
  ],
  [
    'hostname',
    {
      short: ['b', 'F'],
      long: ['boot', 'file'],
      operands: 0,
      valued: { short: ['F'], long: ['file'] },
    },
  ],
  ['rg', { long: ['hostname-bin', 'pre'] }],
  ['sort', { short: ['o', 'T'], long: ['compress-program', 'output', 'temporary-directory'] }],
  [
    'uniq',
    {
      operands: 1,
      valued: {
        short: ['f', 's', 'w'],
        long: ['check-chars', 'skip-chars', 'skip-fields'],
      },
    },
  ],
]);

export const READ_ONLY_GIT_SUBCOMMANDS: ReadonlySet<string> = new Set([
  'blame',
  'describe',
  'diff',
  'log',
  'ls-files',
  'ls-tree',
  'rev-list',
  'rev-parse',
  'shortlog',
  'show',
  'show-ref',
  'status',
  'whatchanged',
]);

// Every reporting git subcommand that takes diff options accepts `--output`,
// which writes the report to a file.
export const UNSAFE_GIT_OPTIONS: UnsafeOptions = { long: ['output'] };

// Global options that set configuration or the path git runs its
// subcommands from, either of which can run a program: `-c core.pager=sh`.
export const UNSAFE_GIT_GLOBAL_OPTIONS: UnsafeOptions = {
  words: ['-c'],
  long: ['config-env', 'exec-path'],
};

export const REGENERABLE_DIRS: ReadonlySet<string> = new Set([
  '.gradle',
  '.next',
  '.nuxt',
  '.parcel-cache',
  '.pytest_cache',
  '.turbo',
  '.venv',
  '__pycache__',
  'build',
  'coverage',
  'dist',
  'node_modules',
  'out',
  'target',
  'venv',
]);
