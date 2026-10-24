import { basename } from 'node:path';
import {
  collectShellScripts,
  splitCommandWords,
  splitGitCommand,
  splitShellCommand,
} from 'auto-mode/eval';
import type { CapturedAction } from './build-anonymised-corpus.ts';
import {
  EMAIL,
  HOME_PATH,
  SCP_REMOTE,
  SHARED_USERS,
  URL_AUTHORITY,
  WINDOWS_HOME,
} from './identifier-patterns.ts';
import type { Groups, IdentifierClass } from './identifier-patterns.ts';

const STRUCTURAL_NAMES = new Set([
  'main',
  'master',
  'trunk',
  'develop',
  'head',
  'origin',
  'upstream',
  'src',
  'lib',
  'app',
  'apps',
  'packages',
  'docs',
  'test',
  'tests',
  'tmp',
  'dist',
  'build',
  'home',
  'users',
  'root',
  'projects',
  'code',
  'work',
  'repos',
  'git',
  'dev',
  'example',
  'invalid',
  'localhost',
  'worktrees',
  'example.com',
  'example.org',
  'example.net',
  'example.invalid',
  '127.0.0.1',
  '0.0.0.0',
]);

export function collectIdentifiers(
  actions: readonly CapturedAction[],
): Readonly<Record<string, IdentifierClass>> {
  const found = new Map<string, IdentifierClass>();

  for (const identifier of actions.flatMap((action) => collectActionIdentifiers(action))) {
    const key = identifier.value.replace(/\.git$/u, '').toLowerCase();

    if (key.length >= 3 && !STRUCTURAL_NAMES.has(key) && !found.has(key)) {
      found.set(key, identifier.kind);
    }
  }

  return Object.fromEntries(found);
}

interface Identifier {
  readonly value: string;
  readonly kind: IdentifierClass;
}

function collectActionIdentifiers(action: Readonly<CapturedAction>): Identifier[] {
  const root = action.cwd.split('/.worktrees/')[0] ?? action.cwd;
  const isHome = /^\/(?:home|Users)\/[^/]+\/?$/u.test(root) || root === '/';

  return [
    ...(isHome ? [] : [{ value: basename(root), kind: 'repo' as const }]),
    ...collectStrings(action.request).flatMap((text) => collectTextIdentifiers(text)),
    ...collectStrings(action.verdict).flatMap((text) => collectTextIdentifiers(text)),
    ...collectCommands(action.request, null).flatMap((command) => collectCommandBranches(command)),
  ];
}

function collectStrings(value: unknown): string[] {
  if (typeof value === 'string') {
    return [value];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item: unknown) => collectStrings(item));
  }

  if (typeof value === 'object' && value !== null) {
    return Object.values(value).flatMap((item: unknown) => collectStrings(item));
  }

  return [];
}

const FORGE_PATH =
  /\b(?:github\.com|gitlab\.com|bitbucket\.org|codeberg\.org)[/:](?<owner>[\w.-]+)\/(?<repo>[\w.-]+)/giu;

const REPO_FLAG = /(?:--repo|-R)[=\s]+(?<owner>[\w.-]+)\/(?<repo>[\w.-]+)/gu;

const DOTTED_NAME =
  /(?<![\w.@/\\-])(?<host>[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+)(?![\w-]|\.\w)/gu;

const HOST_POSITION =
  /\b(?:ssh|scp|rsync|sftp|mosh|ping|telnet|nc|dig|nslookup|curl|wget)\b[^;&|\n]*?(?<=\s)(?:[\w.-]+@)?(?<host>[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+)/gu;

const HOST_FLAG = /(?:--host|-h|-H)[=\s]+(?<host>[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+)/gu;

const FILE_EXTENSIONS = new Set([
  'ts',
  'tsx',
  'js',
  'jsx',
  'mjs',
  'cjs',
  'json',
  'jsonl',
  'md',
  'mdx',
  'txt',
  'yml',
  'yaml',
  'toml',
  'lock',
  'sh',
  'bash',
  'zsh',
  'py',
  'go',
  'rs',
  'rb',
  'java',
  'kt',
  'c',
  'h',
  'cpp',
  'css',
  'scss',
  'html',
  'svg',
  'png',
  'jpg',
  'gif',
  'log',
  'csv',
  'sql',
  'env',
  'tar',
  'gz',
  'zip',
  'pdf',
  'nix',
  'xml',
  'ini',
  'cfg',
  'conf',
  'pem',
  'key',
  'crt',
  'diff',
  'patch',
]);

const BRANCH_PATTERNS = [
  /\b(?:checkout|switch)\s+-[bBcC]\s+(?<branch>[^\s;&|'"]+)/gu,
  /\bworktree\s+add\b[^;&|\n]*?\s-[bB]\s+(?<branch>[^\s;&|'"]+)/gu,
  /\bbranch\s+(?:-[dDmMf]+\s+)+(?<branch>[^\s;&|'"]+)/gu,
  /\s--(?:head|base)[=\s]+(?<branch>[^\s;&|'"]+)/gu,

  /\.worktrees\/(?<branch>[^/\s"',;:()]+?)(?=[.!?]*(?:[/\s"',;:()]|$))/gu,
];

function collectTextIdentifiers(text: string): Identifier[] {
  return [
    ...collectGroups(text, HOME_PATH).map((groups) => ({
      value: groups['user'] ?? '',
      kind: 'user' as const,
    })),
    ...[FORGE_PATH, REPO_FLAG].flatMap((pattern) =>
      collectGroups(text, pattern).flatMap((groups) => [
        { value: groups['owner'] ?? '', kind: 'owner' as const },
        { value: groups['repo'] ?? '', kind: 'repo' as const },
      ]),
    ),
    ...collectGroups(text, WINDOWS_HOME).map((groups) => ({
      value: groups['user'] ?? '',
      kind: 'user' as const,
    })),
    ...collectGroups(text, URL_AUTHORITY).flatMap((groups) => collectForgePath(groups)),
    ...[HOST_POSITION, HOST_FLAG].flatMap((pattern) =>
      collectGroups(text, pattern)
        .map((groups) => groups['host'] ?? '')
        .filter((name) => !FILE_EXTENSIONS.has(name.toLowerCase().split('.').at(-1) ?? ''))
        .map((name) => ({ value: name, kind: 'host' as const })),
    ),
    ...collectGroups(text, DOTTED_NAME)
      .map((groups) => groups['host'] ?? '')
      .filter((name) => isHostName(name))
      .map((name) => ({ value: name, kind: 'host' as const })),
    ...collectGroups(text, URL_AUTHORITY).flatMap((groups) =>
      collectRemoteIdentifiers(groups['userinfo']?.split(':')[0], groups['host'] ?? ''),
    ),
    ...collectGroups(text, SCP_REMOTE).flatMap((groups) =>
      collectRemoteIdentifiers(groups['user'], groups['host'] ?? ''),
    ),
    ...collectGroups(text, EMAIL).map((groups) => ({
      value: groups['host'] ?? '',
      kind: 'host' as const,
    })),
    ...BRANCH_PATTERNS.flatMap((pattern) =>
      collectGroups(text, pattern).map((groups) => ({
        value: toBranchName(groups['branch'] ?? ''),
        kind: 'branch' as const,
      })),
    ),
  ];
}

function collectGroups(text: string, pattern: Readonly<RegExp>): Groups[] {
  return [...text.matchAll(pattern)].map((match) => match.groups ?? {});
}

// A git remote names its owner and repository in the first two path segments,
// so an ssh or git URL, or one whose path ends in .git, names both everywhere.
function collectForgePath(groups: Groups): Identifier[] {
  const scheme = (groups['scheme'] ?? '').toLowerCase();
  const first = groups['first'];
  const second = groups['second'];

  const isRemote =
    scheme.startsWith('ssh') || scheme.startsWith('git') || second?.endsWith('.git') === true;

  return isRemote && first !== undefined && second !== undefined
    ? [
        { value: first, kind: 'owner' },
        { value: second, kind: 'repo' },
      ]
    : [];
}

// Some file extensions, such as `sh` and `md`, are top-level domains as well.
const HOST_SUFFIXES = new Set([
  'com',
  'net',
  'org',
  'io',
  'dev',
  'app',
  'ai',
  'co',
  'uk',
  'de',
  'fr',
  'nl',
  'eu',
  'us',
  'ca',
  'au',
  'jp',
  'cn',
  'ru',
  'br',
  'ch',
  'se',
  'no',
  'fi',
  'dk',
  'pl',
  'it',
  'es',
  'be',
  'at',
  'cz',
  'info',
  'biz',
  'me',
  'tv',
  'cloud',
  'tech',
  'site',
  'xyz',
  'gov',
  'edu',
  'internal',
  'local',
  'lan',
  'corp',
  'home',
  'intranet',
  'private',
  'localdomain',
  'test',
  'tld',
]);

function isHostName(name: string): boolean {
  const labels = name.toLowerCase().split('.');
  const last = labels.at(-1) ?? '';

  return !FILE_EXTENSIONS.has(last) && HOST_SUFFIXES.has(last) && !/^\d+$/u.test(labels[0] ?? '');
}

function collectRemoteIdentifiers(user: string | undefined, host: string): Identifier[] {
  const hostIdentifier: Identifier = { value: host, kind: 'host' };

  return user === undefined || SHARED_USERS.has(user)
    ? [hostIdentifier]
    : [{ value: user, kind: 'user' }, hostIdentifier];
}

function toBranchName(ref: string): string {
  return ref.replace(/^\+/u, '').replace(/^refs\/heads\//u, '');
}

function collectCommands(value: unknown, key: string | null): string[] {
  if (typeof value === 'string') {
    return key === 'command' ? [value] : [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item: unknown) => collectCommands(item, null));
  }

  if (typeof value === 'object' && value !== null) {
    return Object.entries(value).flatMap(([field, item]) => collectCommands(item, field));
  }

  return [];
}

const LINE_CONTINUATION = '\\\n';

// A substitution or a shell's heredoc script runs its own commands, so each is
// read on its own.
function collectCommandBranches(command: string): Identifier[] {
  const substituted = collectShellScripts(command).flatMap((script) =>
    collectCommandBranches(script.text),
  );

  const branches = splitShellCommand(command).segments.flatMap((segment) =>
    collectSegmentBranches(toProgramWords(splitCommandWords(segment.text))),
  );

  return [...substituted, ...branches].flatMap((branch) =>
    branch.value.split(LINE_CONTINUATION).map((value) => ({ value, kind: branch.kind })),
  );
}

const SHELLS = new Set(['bash', 'sh', 'zsh', 'dash']);

function collectSegmentBranches(words: readonly string[]): Identifier[] {
  const [program = '', ...args] = words;
  const script = args.findIndex((arg) => /^-\w*c\w*$/u.test(arg));

  if (SHELLS.has(basename(program)) && script !== -1) {
    return collectCommandBranches(args[script + 1] ?? '');
  }

  if (basename(program) !== 'git') {
    return [];
  }

  const [subcommand, ...rest] = splitGitCommand(args, null, '').args;

  return subcommand === 'push' ? collectPushedBranches(rest) : [];
}

// The first operand names the remote; every later one is a refspec whose
// sides name branches.
function collectPushedBranches(args: readonly string[]): Identifier[] {
  const [, ...refspecs] = args.filter((arg) => !arg.startsWith('-'));

  return refspecs.flatMap((refspec) =>
    refspec.split(':').map((side) => ({ value: toBranchName(side), kind: 'branch' as const })),
  );
}

const COMMAND_PREFIXES = new Set([
  '!',
  'if',
  'then',
  'else',
  'elif',
  'while',
  'until',
  'do',
  'time',
  'exec',
  'nohup',
  'xargs',
  'sudo',
  'command',
]);

const VALUED_PREFIX_OPTIONS = new Set(['-u', '-g', '-n', '-I']);

function toProgramWords(words: readonly string[]): readonly string[] {
  const command = words
    .map((word) => word.replaceAll(/[(){}]/gu, ''))
    .filter((word) => word !== '');

  let index = 0;

  while (index < command.length) {
    const word = command[index] ?? '';
    const isPrefixOption = word.startsWith('-');

    if (!COMMAND_PREFIXES.has(word) && !/^\w+=/u.test(word) && !isPrefixOption) {
      break;
    }

    index += isPrefixOption && VALUED_PREFIX_OPTIONS.has(word) ? 2 : 1;
  }

  return command.slice(index);
}
