import { isAbsolute, join, matchesGlob, normalize } from 'node:path';
import { splitCommandWords } from '../rules/split-command-words.ts';
import { splitShellCommand } from '../rules/split-shell-command.ts';
import { toRepositorySlug } from './to-repository-slug.ts';

export interface ScopeRemote {
  readonly name: string;
  readonly url: string;
}

interface OwnedPullRequest {
  readonly number: number;
  readonly repository: string;
}

export interface OwnedScope {
  readonly home: string;
  readonly worktrees: readonly string[];
  readonly branches: readonly string[];
  readonly currentBranch: string | null;
  readonly remotes: readonly ScopeRemote[];
  readonly pullRequests: readonly OwnedPullRequest[];
  readonly pathGlobs: readonly string[];
}

export interface ScopeFinding {
  readonly kind: 'path' | 'branch' | 'remote-write' | 'credential' | 'prune';
  readonly target: string;
}

interface ScopeAction {
  readonly tool: string;
  readonly cwd: string;
  readonly input: Readonly<Record<string, unknown>>;
}

const SCRATCH_PATHS = ['/tmp', '/dev/null', '/dev/stdout', '/dev/stderr'];

// Reads the action only, never the filesystem. A target it cannot resolve,
// such as a path held in a variable, yields no finding, so the classifier
// still judges it.
export function collectScopeFindings(
  action: Readonly<ScopeAction>,
  scope: Readonly<OwnedScope>,
  scratchPaths: readonly string[] = SCRATCH_PATHS,
): ScopeFinding[] {
  const filePath = action.input['file_path'] ?? action.input['notebook_path'];
  const command = action.input['command'];

  const findings = [
    ...(FILE_WRITE_TOOLS.has(action.tool) && typeof filePath === 'string'
      ? collectTargetFindings(action.cwd, filePath, scope, scratchPaths)
      : []),
    ...(action.tool.startsWith('mcp__') ? collectToolFindings(action, scope) : []),
    ...(action.tool === 'Bash' && typeof command === 'string'
      ? collectCommandFindings(command, action.cwd, scope, scratchPaths)
      : []),
  ];

  return findings.filter(
    (finding, index) =>
      findings.findIndex(
        (other) => other.kind === finding.kind && other.target === finding.target,
      ) === index,
  );
}

const FILE_WRITE_TOOLS: ReadonlySet<string> = new Set([
  'Edit',
  'MultiEdit',
  'Write',
  'NotebookEdit',
]);

function collectTargetFindings(
  directory: string | null,
  target: string,
  scope: Readonly<OwnedScope>,
  scratchPaths: readonly string[],
): ScopeFinding[] {
  const path = resolvePath(directory, target, scope.home);

  return path === null ? [] : collectPathFindings(path, scope, scratchPaths);
}

const CREDENTIAL_PATHS = ['.ssh', '.aws', '.gnupg', '.gitconfig', '.netrc', '.npmrc', '.config/gh'];

function collectPathFindings(
  path: string,
  scope: Readonly<OwnedScope>,
  scratchPaths: readonly string[],
): ScopeFinding[] {
  if (CREDENTIAL_PATHS.some((entry) => isUnder(path, join(scope.home, entry)))) {
    return [{ kind: 'credential', target: path }];
  }

  return isInScope(path, scope, scratchPaths) ? [] : [{ kind: 'path', target: path }];
}

function collectToolFindings(
  action: Readonly<ScopeAction>,
  scope: Readonly<OwnedScope>,
): ScopeFinding[] {
  const verb = action.tool.split('__').at(-1) ?? '';

  if (!/merge|create|comment|update|delete|push|close|review/u.test(verb)) {
    return [];
  }

  const number =
    action.input['pullNumber'] ?? action.input['pull_number'] ?? action.input['issue_number'];

  const owner = action.input['owner'];
  const name = action.input['repo'];

  const repo =
    typeof owner === 'string' && typeof name === 'string' ? `${owner}/${name}` : undefined;

  const isOwned =
    !verb.includes('merge') &&
    typeof number === 'number' &&
    isOwnedPullRequest(number, repo, scope);

  return isOwned ? [] : [{ kind: 'remote-write', target: action.tool }];
}

const PATH_WRITERS = new Set(['rm', 'rmdir', 'shred', 'truncate', 'chmod', 'chown']);
const DESTINATION_WRITERS = new Set(['cp', 'mv', 'rsync', 'ln']);

function collectCommandFindings(
  command: string,
  cwd: string,
  scope: Readonly<OwnedScope>,
  scratchPaths: readonly string[],
): ScopeFinding[] {
  const findings: ScopeFinding[] = [];
  const hasPipe = /(?<!\|)\|(?!\|)/u.test(command);
  let directory: string | null = cwd;

  for (const segment of splitShellCommand(command).segments) {
    const words = splitCommandWords(segment.text);
    const [name, ...args] = words;

    for (const target of collectRedirectTargets(segment.text)) {
      findings.push(...collectTargetFindings(directory, target, scope, scratchPaths));
    }

    if (name === undefined) {
      continue;
    }

    // A `cd` inside a pipeline runs in a subshell, and the segments do not
    // keep their separators, so a pipe leaves the directory unknown.
    if (name === 'cd' && hasPipe) {
      directory = null;
    } else if (name === 'cd') {
      directory = args[0] === undefined ? scope.home : resolvePath(directory, args[0], scope.home);
    } else {
      findings.push(...collectProgramFindings(name, args, directory, cwd, scope, scratchPaths));
    }
  }

  return findings;
}

function collectProgramFindings(
  name: string,
  args: readonly string[],
  directory: string | null,
  cwd: string,
  scope: Readonly<OwnedScope>,
  scratchPaths: readonly string[],
): ScopeFinding[] {
  const resolve = (path: string): ScopeFinding[] =>
    collectTargetFindings(directory, path, scope, scratchPaths);

  const operands = args.filter((word) => !word.startsWith('-'));

  if (name === 'git') {
    return collectGitFindings(args, directory, cwd, scope, scratchPaths);
  }

  if (name === 'gh') {
    return collectGhFindings(args, scope);
  }

  if (PATH_WRITERS.has(name)) {
    return operands.flatMap((path) => resolve(path));
  }

  if (DESTINATION_WRITERS.has(name)) {
    return collectCopyFindings(name, args, operands).flatMap((path) => resolve(path));
  }

  if (name === 'find' && args.some((word) => word === '-delete' || word === '-exec')) {
    return operands.slice(0, 1).flatMap((path) => resolve(path));
  }

  if ((name === 'perl' || name === 'sed') && args.some((word) => /^-\w*i/u.test(word))) {
    return collectInPlaceFiles(args).flatMap((path) => resolve(path));
  }

  if (name === 'ssh-keygen') {
    return collectKeygenFiles(args).flatMap((path) => resolve(path));
  }

  if (name === 'ssh') {
    const logIndex = args.indexOf('-E');
    const log = logIndex === -1 ? undefined : args[logIndex + 1];

    return [...(log === undefined ? [] : resolve(log)), ...collectSSHFindings(args)];
  }

  if (name === 'scp') {
    const destination = collectSSHOperands(args).at(-1);

    if (destination === undefined || /^[^/]+:/u.test(destination)) {
      return destination === undefined ? [] : [{ kind: 'remote-write', target: 'scp' }];
    }

    return resolve(destination);
  }

  if (name === 'curl') {
    return collectCurlFindings(args);
  }

  // The mod alone reports finished calls; a record the agent sends is a claim
  // on scope it did not make, whether it names the bin, a runner, or the script.
  const launcher = [name, ...args].findIndex((word) => word.includes('auto-mode'));

  if (launcher !== -1 && [name, ...args].slice(launcher + 1).includes('record')) {
    return [{ kind: 'credential', target: 'auto-mode record' }];
  }

  const finding = findProgramFinding(name, args);

  return finding === null ? [] : [finding];
}

// `-t DIR` and `--target-directory=DIR` name the destination before the
// sources, so the last operand is then a source.
function collectCopyFindings(
  name: string,
  args: readonly string[],
  operands: readonly string[],
): string[] {
  const optionIndex = args.findIndex((word) => word === '-t' || word === '--target-directory');
  const attached = args.find((word) => word.startsWith('--target-directory='));
  let targetDirectory = attached?.slice('--target-directory='.length);

  if (targetDirectory === undefined && optionIndex !== -1) {
    targetDirectory = args[optionIndex + 1];
  }

  if (targetDirectory !== undefined) {
    const sources = operands.filter((word) => word !== targetDirectory);

    return [targetDirectory, ...(name === 'mv' ? sources : [])];
  }

  if (operands.length < 2) {
    return [];
  }

  return [operands.at(-1) ?? '', ...(name === 'mv' ? operands.slice(0, -1) : [])];
}

const KEYGEN_READ_OPTIONS = new Set(['-l', '-y', '-F', '-B', '-R']);

function collectKeygenFiles(args: readonly string[]): string[] {
  if (args.some((word) => KEYGEN_READ_OPTIONS.has(word))) {
    return [];
  }

  const index = args.indexOf('-f');
  const file = index === -1 ? undefined : args[index + 1];

  return file === undefined ? [] : [file];
}

const SSH_VALUE_OPTIONS = new Set(['-b', '-c', '-D', '-E', '-F', '-i', '-J', '-l', '-L', '-m']);
const SSH_MORE_VALUE_OPTIONS = new Set(['-o', '-p', '-P', '-Q', '-R', '-S', '-W', '-w']);

function collectSSHOperands(args: readonly string[]): string[] {
  const operands: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const word = args[index] ?? '';

    if (operands.length > 0 || !word.startsWith('-')) {
      operands.push(word);
    } else if (SSH_VALUE_OPTIONS.has(word) || SSH_MORE_VALUE_OPTIONS.has(word)) {
      index += 1;
    }
  }

  return operands;
}

const SSH_READS = new Set([
  'cat',
  'df',
  'du',
  'free',
  'head',
  'id',
  'ls',
  'ps',
  'pwd',
  'stat',
  'tail',
  'uname',
  'uptime',
  'whoami',
]);

// A remote command that is one read-only program, with no shell operators or
// newlines, changes nothing on the host. Every other remote session counts as a write.
function collectSSHFindings(args: readonly string[]): ScopeFinding[] {
  const [host, ...remote] = collectSSHOperands(args);

  if (host === undefined) {
    return [];
  }

  const command = remote.join(' ');
  const [program] = command.trim().split(/\s+/u);
  const isRead = SSH_READS.has(program ?? '') && !/[;&|<>`\n\r]|\$\(/u.test(command);

  return isRead ? [] : [{ kind: 'remote-write', target: 'ssh' }];
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '0.0.0.0']);

function collectCurlFindings(args: readonly string[]): ScopeFinding[] {
  const joined = args.join(' ');

  const isUpload = args.some((word) =>
    /^-[a-zA-Z]*[dFT]$|^--(?:data\S*|form|upload-file|json)$/u.test(word),
  );

  const isWriteMethod = /(?:-X\s*|--request\s+)(?:POST|PUT|PATCH|DELETE)/u.test(joined);

  if (!isUpload && !isWriteMethod) {
    return [];
  }

  const hosts = args
    .filter((word) => /^(?:https?:\/\/|localhost\b|127\.)/u.test(word))
    .map(
      (word) =>
        /^(?:https?:\/\/)?(?<host>\[[^\]]+\]|[^/:?#\s]+)/u
          .exec(word)
          ?.groups?.['host']?.toLowerCase() ?? '',
    );

  const isLocal = hosts.length > 0 && hosts.every((host) => LOCAL_HOSTS.has(host));

  return isLocal ? [] : [{ kind: 'remote-write', target: 'curl upload' }];
}

const GIT_DIRECTORY_WRITES = new Set([
  'clean',
  'reset',
  'checkout',
  'switch',
  'merge',
  'commit',
  'rm',
  'stash',
  'push',
]);

function collectGitFindings(
  args: readonly string[],
  directory: string | null,
  cwd: string,
  scope: Readonly<OwnedScope>,
  scratchPaths: readonly string[],
): ScopeFinding[] {
  let gitDirectory = directory;
  let index = 0;

  while (index < args.length && args[index]?.startsWith('-') === true) {
    const option = args[index];

    if (option === '-C') {
      gitDirectory = resolvePath(gitDirectory, args[index + 1] ?? '', scope.home);
    }

    index += option === '-C' || option === '-c' ? 2 : 1;
  }

  const subcommand = args[index] ?? '';
  const rest = args.slice(index + 1);
  const operands = rest.filter((word) => !word.startsWith('-'));
  const findings: ScopeFinding[] = [];

  if (
    gitDirectory !== null &&
    GIT_DIRECTORY_WRITES.has(subcommand) &&
    !isInScope(gitDirectory, scope, scratchPaths)
  ) {
    findings.push({ kind: 'path', target: gitDirectory });
  }

  if (subcommand === 'worktree' && operands[0] === 'remove' && operands[1] !== undefined) {
    findings.push(...collectTargetFindings(gitDirectory, operands[1], scope, scratchPaths));
  }

  if (subcommand === 'branch' && rest.some((word) => /^-(?:d|D|-delete)$/u.test(word))) {
    for (const branch of operands.filter((word) => !scope.branches.includes(word))) {
      findings.push({ kind: 'branch', target: branch });
    }
  }

  const isConfigRead = rest.some((word) => /^--(?:get|get-all|get-regexp|list)$|^-l$/u.test(word));

  if (subcommand === 'config' && rest.includes('--global') && !isConfigRead) {
    findings.push({ kind: 'credential', target: `git config ${operands[0] ?? ''}` });
  }

  if (subcommand === 'push') {
    // The checkout's current branch is known only for the action's own cwd.
    const currentBranch = gitDirectory === cwd ? scope.currentBranch : null;

    findings.push(...collectPushFindings(rest, operands, currentBranch, scope));
  }

  return findings;
}

function collectPushFindings(
  rest: readonly string[],
  operands: readonly string[],
  currentBranch: string | null,
  scope: Readonly<OwnedScope>,
): ScopeFinding[] {
  const [remote, ...refspecs] = operands;
  const findings: ScopeFinding[] = [];

  if (rest.includes('--all') || rest.includes('--mirror')) {
    findings.push({ kind: 'branch', target: '--all' });
  }

  if (remote !== undefined && !isUnresolved(remote) && !isOwnedRemote(remote, scope)) {
    findings.push({ kind: 'remote-write', target: remote });
  }

  const destinations = refspecs.length === 0 && !rest.includes('--tags') ? ['HEAD'] : refspecs;

  for (const refspec of destinations) {
    const destination = (refspec.split(':').at(-1) ?? refspec).replace(/^\+/u, '');
    const named = destination.replace(/^refs\/heads\//u, '');
    const branch = named === 'HEAD' ? currentBranch : named;

    if (
      branch !== null &&
      !isUnresolved(branch) &&
      !branch.startsWith('refs/tags/') &&
      !scope.branches.includes(branch)
    ) {
      findings.push({ kind: 'branch', target: branch });
    }
  }

  return findings;
}

function isUnresolved(word: string): boolean {
  return /[$`]/u.test(word);
}

function isOwnedRemote(remote: string, scope: Readonly<OwnedScope>): boolean {
  if (scope.remotes.some((entry) => entry.name === remote)) {
    return true;
  }

  const slug = toRepositorySlug(remote);

  return slug !== null && scope.remotes.some((entry) => toRepositorySlug(entry.url) === slug);
}

const GH_PR_WRITES = new Set(['comment', 'merge', 'edit', 'close', 'review', 'ready', 'reopen']);
const GH_REMOTE_WRITES = new Set(['gist', 'release', 'repo', 'ruleset', 'label', 'workflow']);
const GH_CREDENTIAL_WRITES = new Set(['secret', 'variable', 'ssh-key', 'gpg-key']);
const GH_READS = new Set(['list', 'view', 'clone', 'status', 'checks', 'diff']);

function collectGhFindings(args: readonly string[], scope: Readonly<OwnedScope>): ScopeFinding[] {
  const group = args[0] ?? '';
  const verb = args[1] ?? '';

  if (group === 'pr' && GH_PR_WRITES.has(verb)) {
    const number = Number(args.slice(2).find((word) => /^\d+$/u.test(word)));
    const repoIndex = args.findIndex((word) => word === '--repo' || word === '-R');
    const repo = repoIndex === -1 ? undefined : args[repoIndex + 1];
    const isOwned = verb !== 'merge' && isOwnedPullRequest(number, repo, scope);

    return isOwned ? [] : [{ kind: 'remote-write', target: `gh pr ${verb}` }];
  }

  if (group === 'issue' && verb !== '' && !GH_READS.has(verb)) {
    return [{ kind: 'remote-write', target: `gh issue ${verb}` }];
  }

  if (group === 'api') {
    return collectGhAPIFindings(args.slice(1), scope);
  }

  if (group === 'auth' && ['refresh', 'login', 'logout'].includes(verb)) {
    return [{ kind: 'credential', target: `gh auth ${verb}` }];
  }

  if (GH_CREDENTIAL_WRITES.has(group) && !GH_READS.has(verb)) {
    return [{ kind: 'credential', target: `gh ${group} ${verb}` }];
  }

  if (GH_REMOTE_WRITES.has(group) && !GH_READS.has(verb)) {
    return [{ kind: 'remote-write', target: `gh ${group} ${verb}` }];
  }

  return [];
}

// `gh --repo` takes `owner/name` or `host/owner/name`; a bare `owner/name`
// matches on any host. Without a repository gh picks one of the checkout's
// remotes, so the PR counts only when every remote names its repository.
function isOwnedPullRequest(
  number: number,
  repo: string | undefined,
  scope: Readonly<OwnedScope>,
): boolean {
  const wanted = repo?.toLowerCase().replace(/\.git$/u, '');

  const slugs = new Set(scope.remotes.map((remote) => toRepositorySlug(remote.url)));

  return scope.pullRequests.some(
    (pull) =>
      pull.number === number &&
      (wanted === undefined
        ? slugs.size === 1 && slugs.has(pull.repository)
        : pull.repository === wanted || pull.repository.endsWith(`/${wanted}`)),
  );
}

function collectGhAPIFindings(
  args: readonly string[],
  scope: Readonly<OwnedScope>,
): ScopeFinding[] {
  const endpoint = args.find((word) => !word.startsWith('-')) ?? '';

  if (endpoint === 'graphql') {
    return args.some((word) => /\bmutation\b/u.test(word))
      ? [{ kind: 'remote-write', target: 'gh api graphql mutation' }]
      : [];
  }

  const methodIndex = args.findIndex((word) => word === '-X' || word === '--method');
  const method = methodIndex === -1 ? null : (args[methodIndex + 1] ?? '').toUpperCase();
  const hasFields = args.some((word) => /^(?:-f|-F|--field|--raw-field|--input)$/u.test(word));

  // `gh api` sends fields as a POST body unless the method is GET, which turns
  // them into query parameters.
  if (method === 'GET' || (method === null && !hasFields)) {
    return [];
  }

  const pull = /^\/?repos\/(?<repo>[^/]+\/[^/]+)\/(?:pulls|issues)\/(?<number>\d+)(?:\/|$)/u.exec(
    endpoint,
  )?.groups;

  if (
    pull !== undefined &&
    isOwnedPullRequest(Number(pull['number']), pull['repo'] ?? '', scope) &&
    !endpoint.includes('/merge')
  ) {
    return [];
  }

  const isCredential = /secret|collaborator|protection|key|permission/u.test(endpoint);

  return [{ kind: isCredential ? 'credential' : 'remote-write', target: `gh api ${endpoint}` }];
}

const IAM_WRITE =
  /^(?:add|attach|change|create|deactivate|delete|detach|enable|put|remove|reset|set|tag|untag|update|upload)-/u;

function findProgramFinding(name: string, args: readonly string[]): ScopeFinding | null {
  const joined = args.join(' ');

  if (name === 'op' && /^(?:item|vault|document) (?:edit|create|delete)\b/u.test(joined)) {
    return { kind: 'credential', target: `op ${args[0] ?? ''} ${args[1] ?? ''}` };
  }

  if (name === 'aws' && args[0] === 'iam' && IAM_WRITE.test(args[1] ?? '')) {
    return { kind: 'credential', target: `aws iam ${args[1] ?? ''}` };
  }

  if (
    name === 'docker' &&
    /\b(?:volume|system|image|container) prune\b|\bvolume rm\b|\bdown\b.*(?:-v|--volumes)\b/u.test(
      joined,
    )
  ) {
    return { kind: 'prune', target: `docker ${joined}` };
  }

  if (name === 'npm' && args[0] === 'publish') {
    return { kind: 'remote-write', target: 'npm publish' };
  }

  if (name === 'kubectl' && /\b(?:apply|delete|replace|patch|scale)\b/u.test(joined)) {
    return { kind: 'remote-write', target: 'kubectl write' };
  }

  if (name === 'terraform' && /\b(?:apply|destroy|import)\b/u.test(joined)) {
    return { kind: 'remote-write', target: 'terraform write' };
  }

  if (name === 'psql' && /\b(?:UPDATE|DELETE|DROP|INSERT|TRUNCATE|ALTER)\b/iu.test(joined)) {
    return { kind: 'remote-write', target: 'database write' };
  }

  if (/^(?:bun|npm|pnpm|yarn)$/u.test(name) && /\bdeploy\b/u.test(joined) && /prod/u.test(joined)) {
    return { kind: 'remote-write', target: 'production deploy' };
  }

  return null;
}

// Reads output redirections outside quotes, with or without a descriptor
// number, and their target with its quotes removed. `>&2` and `2>&1`
// duplicate a descriptor and write no file.
function collectRedirectTargets(text: string): string[] {
  const targets: string[] = [];
  let quote: string | null = null;
  let index = 0;

  while (index < text.length) {
    const ch = text.charAt(index);

    if (quote !== null) {
      quote = ch === quote ? null : quote;
      index += 1;
    } else if (ch === "'" || ch === '"') {
      quote = ch;
      index += 1;
    } else if (ch === '>' && text.charAt(index - 1) !== '<') {
      let next = index + 1;

      if (text.charAt(next) === '>' || text.charAt(next) === '|') {
        next += 1;
      }

      if (text.charAt(next) === '&') {
        index = next + 1;
        continue;
      }

      const [target, end] = readWord(text, next);

      if (target !== '') {
        targets.push(target);
      }

      index = end;
    } else {
      index += 1;
    }
  }

  return targets;
}

function readWord(text: string, start: number): [string, number] {
  let index = start;

  while (/\s/u.test(text.charAt(index))) {
    index += 1;
  }

  let word = '';
  let quote: string | null = null;

  while (index < text.length) {
    const ch = text.charAt(index);

    if (quote !== null) {
      if (ch === quote) {
        quote = null;
      } else {
        word += ch;
      }
    } else if (ch === "'" || ch === '"') {
      quote = ch;
    } else if (/[\s;&|<>()]/u.test(ch)) {
      break;
    } else {
      word += ch;
    }

    index += 1;
  }

  return [word, index];
}

function collectInPlaceFiles(args: readonly string[]): string[] {
  const files: string[] = [];
  let skipNext = false;
  let sawScript = false;

  for (const word of args) {
    if (skipNext) {
      skipNext = false;
      sawScript = true;
    } else if (/^-\w*e$/u.test(word)) {
      skipNext = true;
    } else if (!word.startsWith('-')) {
      if (sawScript) {
        files.push(word);
      } else {
        sawScript = true;
      }
    }
  }

  return files;
}

// A target built from a variable, a substitution, or another user's home
// cannot be resolved from the command text alone, nor can a relative one
// when the directory is unknown.
function resolvePath(cwd: string | null, path: string, home: string): string | null {
  const expanded = path.replace(/^(?:~|\$HOME|\$\{HOME\})(?=\/|$)/u, home);

  if (/[$`]|^~/u.test(expanded) || expanded === '') {
    return null;
  }

  if (cwd === null && !isAbsolute(expanded)) {
    return null;
  }

  const absolute = isAbsolute(expanded) || cwd === null ? expanded : join(cwd, expanded);

  return normalize(absolute).replace(/(?<=.)\/$/u, '');
}

// A worktree nested under another, as `.worktrees/<name>` is, belongs to its own
// task: being inside the parent checkout does not put it in the parent's scope.
function isInScope(
  path: string,
  scope: Readonly<OwnedScope>,
  scratchPaths: readonly string[],
): boolean {
  if (
    scratchPaths.some((entry) => isUnder(path, entry)) ||
    scope.pathGlobs.some((glob) => matchesGlob(path, glob))
  ) {
    return true;
  }

  return scope.worktrees.some((worktree) => {
    const isNested = isUnder(path, join(worktree, '.worktrees'));

    const isOtherOwned = scope.worktrees.some(
      (other) => other !== worktree && isUnder(path, other),
    );

    return isUnder(path, worktree) && (!isNested || isOtherOwned);
  });
}

function isUnder(path: string, root: string): boolean {
  return path === root || path.startsWith(`${root}/`);
}
