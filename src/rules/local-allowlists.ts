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
  readonly short?: readonly string[];

  // getopt_long accepts an unambiguous prefix such as `--out` for `--output`.
  readonly long?: readonly string[];

  readonly words?: readonly string[];

  readonly operands?: number;

  // A short option that takes a value takes the rest of its cluster, so `sort -to`
  // sets the separator to `o`, or else the next word, as does a long one written
  // without `=`.
  readonly valued?: ValuedOptions;
}

interface ValuedOptions {
  readonly short: readonly string[];
  readonly attached?: readonly string[];
  readonly long: readonly string[];
}

export const UNSAFE_OPTIONS: ReadonlyMap<string, UnsafeOptions> = new Map([
  [
    'date',
    {
      short: ['s'],
      long: ['set'],
      valued: {
        short: ['d', 'f', 'r'],
        attached: ['I'],
        long: ['date', 'file', 'reference', 'rfc-3339'],
      },
    },
  ],
  [
    'fd',
    {
      short: ['x', 'X'],
      long: ['exec', 'exec-batch'],
      valued: {
        short: ['c', 'd', 'e', 'E', 'j', 'o', 'S', 't'],
        long: ['color', 'exclude', 'extension', 'max-depth', 'owner', 'size', 'threads', 'type'],
      },
    },
  ],
  [
    'file',
    {
      short: ['C'],
      long: ['compile'],
      valued: {
        short: ['e', 'f', 'F', 'm', 'P'],
        long: ['exclude', 'exclude-quiet', 'files-from', 'magic-file', 'parameter', 'separator'],
      },
    },
  ],
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
    },
  ],
  ['rg', { short: ['z'], long: ['hostname-bin', 'pre', 'search-zip'] }],
  [
    'sort',
    {
      short: ['o', 'T'],
      long: ['compress-program', 'output', 'temporary-directory'],
      valued: {
        short: ['k', 'S', 't'],
        long: [
          'batch-size',
          'buffer-size',
          'field-separator',
          'files0-from',
          'key',
          'parallel',
          'random-source',
          'sort',
        ],
      },
    },
  ],
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
// which writes the report to a file, and `--ext-diff` and `--textconv`, which
// run the programs the git configuration names.
export const UNSAFE_GIT_OPTIONS: UnsafeOptions = { long: ['ext-diff', 'output', 'textconv'] };

// These git global options take no value and change only how a report is
// shown.
export const SAFE_GIT_GLOBAL_FLAGS: ReadonlySet<string> = new Set(['--no-pager', '-P']);

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
