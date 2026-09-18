/**
 * Tools whose documented effect is to read. Names differ by harness, so this
 * set holds every spelling the three use.
 */
export const READ_ONLY_TOOLS: ReadonlySet<string> = new Set([
  'Read',
  'Glob',
  'Grep',
  'LS',
  'NotebookRead',
  'WebFetch',
  'WebSearch',
  'TodoWrite',
  'read',
  'glob',
  'grep',
  'list_dir',
  'read_file',
  'file_search',
  'view_image',
]);

/** Tools that carry a shell command and so need the command read instead. */
export const SHELL_TOOLS: ReadonlySet<string> = new Set([
  'Bash',
  'bash',
  'shell',
  'run_command',
  'local_shell',
]);

/**
 * Commands that only print. A command outside this set is not assumed to
 * write — it is simply not decided here, and goes to the model.
 */
export const READ_ONLY_COMMANDS: ReadonlySet<string> = new Set([
  'awk',
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
  'env',
  'false',
  'fd',
  'file',
  'find',
  'grep',
  'head',
  'hostname',
  'id',
  'jq',
  'less',
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
  'xxd',
  'yq',
]);

/** `git` subcommands that only report. */
export const READ_ONLY_GIT_SUBCOMMANDS: ReadonlySet<string> = new Set([
  'blame',
  'describe',
  'diff',
  'log',
  'ls-files',
  'ls-remote',
  'ls-tree',
  'rev-list',
  'rev-parse',
  'shortlog',
  'show',
  'show-ref',
  'status',
  'tag',
  'whatchanged',
]);

/**
 * Directory names a build reproduces. Deleting one of these inside the working
 * tree is the Regenerable output exception, which is the single most common
 * thing a classifier gets wrong.
 */
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
