import { createHmac } from 'node:crypto';
import { basename } from 'node:path';
import { findSecret } from 'auto-mode/eval';

export interface CapturedAction {
  readonly cwd: string;
  readonly request: unknown;
  readonly verdict: unknown;
  readonly decidingStage: string;
}

interface AnonymisedCase {
  readonly id: string;
  readonly source: 'recorded';
  readonly request: unknown;
  readonly recordedVerdict: unknown;
  readonly decidingStage: string;
}

export interface AnonymisedCorpus {
  readonly schemaVersion: 1;
  readonly cases: readonly AnonymisedCase[];
}

// The salt keys every placeholder, so one corpus maps a value to one
// placeholder while a corpus built with another salt cannot be joined to it.
export function buildAnonymisedCorpus(
  actions: readonly CapturedAction[],
  salt: string,
): AnonymisedCorpus {
  const identifiers = collectIdentifiers(actions);
  const rewrite = makeStringRewriter(identifiers, salt);

  return {
    schemaVersion: 1,
    cases: actions.map((action, index) => ({
      id: `recorded-${String(index + 1).padStart(4, '0')}`,
      source: 'recorded',
      request: toAnonymisedValue(action.request, null, rewrite, salt),
      recordedVerdict: toAnonymisedValue(action.verdict, null, rewrite, salt),
      decidingStage: action.decidingStage,
    })),
  };
}

type IdentifierClass = 'user' | 'host' | 'owner' | 'repo' | 'branch';

interface Identifier {
  readonly value: string;
  readonly kind: IdentifierClass;
}

const HOME_PATH = /\/(?<base>home|Users)\/(?<user>[^/\s"'`:;|&<>()]+)/g;
const WINDOWS_HOME = /\b(?<prefix>[A-Za-z]:[\\/]+Users[\\/]+)(?<user>[^\\/\s"'`:;|&<>()]+)/g;

const FORGE_PATH =
  /\b(?:github\.com|gitlab\.com|bitbucket\.org|codeberg\.org)[/:](?<owner>[\w.-]+)\/(?<repo>[\w.-]+)/gi;

const REPO_FLAG = /(?:--repo|-R)[=\s]+(?<owner>[\w.-]+)\/(?<repo>[\w.-]+)/g;

const URL_AUTHORITY =
  /\b(?<scheme>[a-z][a-z0-9+.-]*:\/\/)(?:(?<userinfo>[^\s/@"'<>]+)@)?(?<host>[A-Za-z0-9.-]+)(?<port>:\d+)?(?:\/(?<first>[^\s/?#"'<>]+)(?:\/(?<second>[^\s/?#"'<>]+))?)?/gi;

const QUERY_VALUE = /(?<prefix>[?&][\w.~-]+=)(?<value>[^&#\s"'<>]+)/g;

const SECRET_FLAG =
  /(?<flag>--(?:password|passwd|pass|token|secret|api-key|apikey|auth|auth-token)(?:=|\s+))(?<value>[^\s"'&;|]+)/gi;

const ATTACHED_PASSWORD = /(?<flag>(?<![\w-])-p)(?<value>[^\s"'&;|]*[A-Za-z][^\s"'&;|]*)/g;
const IPV4 = /(?<![\w.])(?:\d{1,3}\.){3}\d{1,3}(?![\w.])/g;
const IPV6 = /(?<![\w:])[0-9A-Fa-f]{0,4}(?::[0-9A-Fa-f]{0,4}){2,7}(?![\w:])/g;

const KEPT_ADDRESSES = new Set(['127.0.0.1', '0.0.0.0', '::1', '::', 'localhost']);

const DOTTED_NAME =
  /(?<![\w.@/\\-])(?<host>[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+)(?![\w-]|\.\w)/g;

const HOST_POSITION =
  /\b(?:ssh|scp|rsync|sftp|mosh|ping|telnet|nc|dig|nslookup|curl|wget)\b[^;&|\n]*?(?<=\s)(?:[\w.-]+@)?(?<host>[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+)/g;

const HOST_FLAG = /(?:--host|-h|-H)[=\s]+(?<host>[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+)/g;

// Top-level and private suffixes that mark a dotted name as a host; a file
// extension wins over a suffix, so `install.sh` and `README.md` stay names.
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

const SCP_REMOTE = /\b(?<user>[\w.-]+)@(?<host>[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+):/g;
const EMAIL = /\b[\w.+-]+@(?<host>[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+)\b/g;

const BRANCH_PATTERNS = [
  /\b(?:checkout|switch)\s+-[bBcC]\s+(?<branch>[^\s;&|'"]+)/g,
  /\bworktree\s+add\b[^;&|\n]*?\s-[bB]\s+(?<branch>[^\s;&|'"]+)/g,
  /\bbranch\s+(?:-[dDmMf]+\s+)+(?<branch>[^\s;&|'"]+)/g,
  /\s--(?:head|base)[=\s]+(?<branch>[^\s;&|'"]+)/g,
  /\.worktrees\/(?<branch>[^/\s"']+)/g,
];

const GIT_PUSH = /\bpush\b(?<args>(?:\s+[^\s;&|]+)*)/g;

const SHARED_USERS = new Set(['git', 'x-access-token', 'oauth2', 'token']);

// Names that carry the shape of an action rather than who ran it; replacing
// them would hide the structure the corpus exists to keep.
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

function collectIdentifiers(
  actions: readonly CapturedAction[],
): Readonly<Record<string, IdentifierClass>> {
  const found = new Map<string, IdentifierClass>();

  for (const identifier of actions.flatMap((action) => collectActionIdentifiers(action))) {
    const key = identifier.value.replace(/\.git$/, '').toLowerCase();

    if (key.length >= 3 && !STRUCTURAL_NAMES.has(key) && !found.has(key)) {
      found.set(key, identifier.kind);
    }
  }

  return Object.fromEntries(found);
}

function collectActionIdentifiers(action: Readonly<CapturedAction>): Identifier[] {
  const root = action.cwd.split('/.worktrees/')[0] ?? action.cwd;
  const isHome = /^\/(?:home|Users)\/[^/]+\/?$/.test(root) || root === '/';

  return [
    ...(isHome ? [] : [{ value: basename(root), kind: 'repo' as const }]),
    ...collectStrings(action.request).flatMap((text) => collectTextIdentifiers(text)),
    ...collectStrings(action.verdict).flatMap((text) => collectTextIdentifiers(text)),
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
    ...collectGroups(text, GIT_PUSH).flatMap((groups) =>
      collectPushedBranches(groups['args'] ?? ''),
    ),
  ];
}

type Groups = Readonly<Record<string, string | undefined>>;

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

function isHostName(name: string): boolean {
  const labels = name.toLowerCase().split('.');
  const last = labels.at(-1) ?? '';

  return !FILE_EXTENSIONS.has(last) && HOST_SUFFIXES.has(last) && !/^\d+$/.test(labels[0] ?? '');
}

function collectRemoteIdentifiers(user: string | undefined, host: string): Identifier[] {
  const hostIdentifier: Identifier = { value: host, kind: 'host' };

  return user === undefined || SHARED_USERS.has(user)
    ? [hostIdentifier]
    : [{ value: user, kind: 'user' }, hostIdentifier];
}

// The first argument after the flags names the remote; every later one is a
// refspec whose sides name branches.
function collectPushedBranches(args: string): Identifier[] {
  const [, ...refspecs] = args
    .trim()
    .split(/\s+/)
    .filter((arg) => !arg.startsWith('-'));

  return refspecs.flatMap((refspec) =>
    refspec.split(':').map((side) => ({ value: toBranchName(side), kind: 'branch' as const })),
  );
}

function toBranchName(ref: string): string {
  return ref.replace(/^\+/, '').replace(/^refs\/heads\//, '');
}

type Rewriter = (text: string) => string;

const PRIVATE_KEY = /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g;

const KNOWN_TOKEN =
  /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_\w{20,}|sk-[\w-]{20,}|xox[abposr]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16}|glpat-[\w-]{20,}|npm_[A-Za-z0-9]{36}|eyJ[\w-]+\.[\w-]+\.[\w-]+)/g;

const LONG_RUN = /(?<![\w+=-])[\w+=-]{32,}(?![\w+=-])/g;

const SECRET_ASSIGNMENT =
  /\b(?<name>[A-Za-z_][\w-]*(?:key|token|secret|password|passwd|pwd|credential|auth)[\w-]*)(?<separator>\s*[=:]\s*["']?)(?<value>[^\s"'&;|]{6,})/gi;

const AUTH_SCHEME = /\b(?<scheme>Bearer|Basic)\s+(?<value>[\w.~+/=-]{8,})/g;

function makeStringRewriter(
  identifiers: Readonly<Record<string, IdentifierClass>>,
  salt: string,
): Rewriter {
  const toPlaceholder = (kind: string, value: string): string =>
    derivePlaceholder(kind, value, salt);

  const toClassedPlaceholder = (fallback: IdentifierClass, value: string): string => {
    const key = value.toLowerCase();
    const kind = Object.hasOwn(identifiers, key) ? (identifiers[key] ?? fallback) : fallback;

    return toPlaceholder(kind, value);
  };

  const names = Object.keys(identifiers)
    .toSorted((a, b) => b.length - a.length)
    .map((name) => name.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`));

  const identifierPattern =
    names.length === 0
      ? null
      : new RegExp(`(?<![A-Za-z0-9])(?:${names.join('|')})(?![A-Za-z0-9])`, 'gi');

  // The URL pass runs first because it drops a password in the user info
  // whole, which a token pass would otherwise split from its URL.
  const steps: readonly Rewriter[] = [
    (text) =>
      buildReplacedText(text, URL_AUTHORITY, (_match, groups) => {
        const userinfo = groups['userinfo']?.split(':')[0];
        const host = groups['host'] ?? '';

        if (KEPT_ADDRESSES.has(host)) {
          return _match;
        }

        const user =
          userinfo === undefined
            ? ''
            : `${SHARED_USERS.has(userinfo) ? userinfo : toClassedPlaceholder('user', userinfo)}@`;

        const first = groups['first'];
        const second = groups['second'];
        const firstPart = first === undefined ? '' : `/${toClassedPlaceholder('owner', first)}`;

        const secondPart =
          second === undefined
            ? ''
            : `/${toClassedPlaceholder('repo', second.replace(/\.git$/, ''))}${second.endsWith('.git') ? '.git' : ''}`;

        return `${groups['scheme'] ?? ''}${user}${toClassedPlaceholder('host', host)}.example${groups['port'] ?? ''}${firstPart}${secondPart}`;
      }),
    (text) =>
      buildReplacedText(
        text,
        QUERY_VALUE,
        (_match, groups) =>
          `${groups['prefix'] ?? ''}${toPlaceholder('token', groups['value'] ?? '')}`,
      ),
    (text) =>
      buildReplacedText(
        text,
        SECRET_FLAG,
        (_match, groups) =>
          `${groups['flag'] ?? ''}${toPlaceholder('token', groups['value'] ?? '')}`,
      ),
    (text) =>
      buildReplacedText(
        text,
        ATTACHED_PASSWORD,
        (_match, groups) =>
          `${groups['flag'] ?? ''}${toPlaceholder('token', groups['value'] ?? '')}`,
      ),
    (text) => buildReplacedText(text, PRIVATE_KEY, (match) => toPlaceholder('token', match)),
    (text) => buildSecretFreeText(text, (secret) => toPlaceholder('token', secret)),
    (text) => buildReplacedText(text, KNOWN_TOKEN, (match) => toPlaceholder('token', match)),
    (text) =>
      buildReplacedText(text, LONG_RUN, (match) =>
        isTokenLike(match) ? toPlaceholder('token', match) : match,
      ),
    (text) =>
      buildReplacedText(
        text,
        SECRET_ASSIGNMENT,
        (_match, groups) =>
          `${groups['name'] ?? ''}${groups['separator'] ?? ''}${toPlaceholder('token', groups['value'] ?? '')}`,
      ),
    (text) =>
      buildReplacedText(
        text,
        AUTH_SCHEME,
        (_match, groups) =>
          `${groups['scheme'] ?? ''} ${toPlaceholder('token', groups['value'] ?? '')}`,
      ),
    (text) =>
      buildReplacedText(text, SCP_REMOTE, (_match, groups) => {
        const user = groups['user'] ?? '';
        const shown = SHARED_USERS.has(user) ? user : toClassedPlaceholder('user', user);

        return `${shown}@${toClassedPlaceholder('host', groups['host'] ?? '')}.example:`;
      }),
    (text) =>
      buildReplacedText(text, EMAIL, (match) => `${toPlaceholder('email', match)}@example.invalid`),
    (text) =>
      buildReplacedText(
        text,
        WINDOWS_HOME,
        (_match, groups) =>
          `${groups['prefix'] ?? ''}${toClassedPlaceholder('user', groups['user'] ?? '')}`,
      ),
    (text) =>
      buildReplacedText(text, IPV4, (match) =>
        KEPT_ADDRESSES.has(match) ? match : toPlaceholder('host', match),
      ),
    (text) =>
      buildReplacedText(text, IPV6, (match) =>
        KEPT_ADDRESSES.has(match) ||
        (!match.includes('::') && match.split(':').length < 8) ||
        !/\d/.test(match)
          ? match
          : toPlaceholder('host', match),
      ),
    (text) =>
      buildReplacedText(
        text,
        HOME_PATH,
        (_match, groups) =>
          `/${groups['base'] ?? ''}/${toClassedPlaceholder('user', groups['user'] ?? '')}`,
      ),
    (text) =>
      identifierPattern === null
        ? text
        : buildReplacedText(text, identifierPattern, (match) =>
            toClassedPlaceholder('repo', match),
          ),
  ];

  return (text) => steps.reduce((current, step) => step(current), text);
}

function derivePlaceholder(kind: string, value: string, salt: string): string {
  const digest = createHmac('sha256', salt).update(`${kind}\0${value.toLowerCase()}`).digest('hex');

  return `${kind}-${digest.slice(0, 8)}`;
}

const PLACEHOLDER =
  /(?<placeholder>(?:user|host|owner|repo|branch|token|email|session|tool|agent)-[0-9a-f]{8})/;

// A placeholder is split out before each pass, so no later pass rewrites a
// value an earlier one already replaced.
function buildReplacedText(
  text: string,
  pattern: Readonly<RegExp>,
  replacer: (match: string, groups: Groups) => string,
): string {
  return text
    .split(PLACEHOLDER)
    .map((part, index) =>
      index % 2 === 1
        ? part
        : part.replace(pattern, (...args: readonly unknown[]) => {
            const last = args.at(-1);
            const groups = isGroups(last) ? last : {};

            return replacer(String(args[0]), groups);
          }),
    )
    .join('');
}

function isGroups(value: unknown): value is Groups {
  return typeof value === 'object' && value !== null;
}

const MAX_SECRET_PASSES = 50;

function buildSecretFreeText(text: string, toReplacement: (secret: string) => string): string {
  let current = text;

  for (let pass = 0; pass < MAX_SECRET_PASSES; pass += 1) {
    const finding = findSecret({ text: current, path: null });

    if (finding === null || finding.secret === '' || !current.includes(finding.secret)) {
      return current;
    }

    current = current.replaceAll(finding.secret, toReplacement(finding.secret));
  }

  return current;
}

function isTokenLike(run: string): boolean {
  return /^[0-9a-f]+$/i.test(run) || (/[A-Z]/.test(run) && /[a-z]/.test(run) && /\d/.test(run));
}

const ID_FIELDS: Readonly<Record<string, string>> = {
  sessionID: 'session',
  toolUseID: 'tool',
  agentID: 'agent',
};

function toAnonymisedValue(
  value: unknown,
  key: string | null,
  rewrite: Rewriter,
  salt: string,
): unknown {
  if (typeof value === 'string') {
    const idKind = key === null ? undefined : ID_FIELDS[key];

    return idKind === undefined ? rewrite(value) : derivePlaceholder(idKind, value, salt);
  }

  if (Array.isArray(value)) {
    return value.map((item: unknown) => toAnonymisedValue(item, null, rewrite, salt));
  }

  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([field, item]) => [
        field,
        toAnonymisedValue(item, field, rewrite, salt),
      ]),
    );
  }

  return value;
}
