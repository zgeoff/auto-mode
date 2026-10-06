import { isAbsolute, join, normalize } from 'node:path';
import { splitShellCommand } from '../rules/split-shell-command.ts';

export interface OwnedScope {
  readonly home: string;
  readonly repository: string;
  readonly worktrees: readonly string[];
  readonly branches: readonly string[];
  readonly pullRequests: readonly number[];
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

// Collects the parts of an action that reach outside the task's own worktree,
// branch, or pull request. It reads the action only, never the filesystem.
export function collectScopeFindings(
  action: Readonly<ScopeAction>,
  scope: Readonly<OwnedScope>,
): ScopeFinding[] {
  const filePath = action.input['file_path'] ?? action.input['notebook_path'];
  const command = action.input['command'];

  const findings = [
    ...(typeof filePath === 'string'
      ? collectPathFindings(resolvePath(action.cwd, filePath, scope.home), scope)
      : []),
    ...(action.tool.startsWith('mcp__') ? collectToolFindings(action, scope) : []),
    ...(action.tool === 'Bash' && typeof command === 'string'
      ? collectCommandFindings(command, action.cwd, scope)
      : []),
  ];

  return findings.filter(
    (finding, index) =>
      findings.findIndex(
        (other) => other.kind === finding.kind && other.target === finding.target,
      ) === index,
  );
}

const CREDENTIAL_PATHS = ['.ssh', '.aws', '.gnupg', '.gitconfig', '.netrc', '.npmrc', '.config/gh'];

function collectPathFindings(path: string, scope: Readonly<OwnedScope>): ScopeFinding[] {
  if (CREDENTIAL_PATHS.some((entry) => isUnder(path, join(scope.home, entry)))) {
    return [{ kind: 'credential', target: path }];
  }

  return isInScope(path, scope) ? [] : [{ kind: 'path', target: path }];
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

  const isOwned =
    !verb.includes('merge') && typeof number === 'number' && scope.pullRequests.includes(number);

  return isOwned ? [] : [{ kind: 'remote-write', target: action.tool }];
}

const PATH_WRITERS = new Set(['rm', 'rmdir', 'shred', 'truncate', 'chmod', 'chown']);
const DESTINATION_WRITERS = new Set(['cp', 'mv', 'rsync', 'ln']);

function collectCommandFindings(
  command: string,
  cwd: string,
  scope: Readonly<OwnedScope>,
): ScopeFinding[] {
  const findings: ScopeFinding[] = [];
  let directory = cwd;

  for (const segment of splitShellCommand(command).segments) {
    const unquoted = segment.text.replaceAll(/'[^']*'|"[^"]*"/gu, "''");
    const words = getCommandWords(splitWords(segment.text));
    const [name, ...args] = words;

    for (const target of collectRedirectTargets(unquoted)) {
      findings.push(...collectPathFindings(resolvePath(directory, target, scope.home), scope));
    }

    if (name === undefined) {
      continue;
    }

    if (name === 'cd' && args[0] !== undefined) {
      directory = resolvePath(directory, args[0], scope.home);
    } else {
      findings.push(...collectProgramFindings(name, args, directory, scope));
    }
  }

  return findings;
}

function collectProgramFindings(
  name: string,
  args: readonly string[],
  directory: string,
  scope: Readonly<OwnedScope>,
): ScopeFinding[] {
  const resolve = (path: string): ScopeFinding[] =>
    collectPathFindings(resolvePath(directory, path, scope.home), scope);

  const operands = args.filter((word) => !word.startsWith('-'));

  if (name === 'git') {
    return collectGitFindings(args, directory, scope);
  }

  if (name === 'gh') {
    return collectGhFindings(args, scope);
  }

  if (PATH_WRITERS.has(name)) {
    return operands.flatMap((path) => resolve(path));
  }

  if (DESTINATION_WRITERS.has(name) && operands.length > 1) {
    const sources = name === 'mv' ? operands.slice(0, -1) : [];

    return [...resolve(operands.at(-1) ?? ''), ...sources.flatMap((path) => resolve(path))];
  }

  if (name === 'find' && args.some((word) => word === '-delete' || word === '-exec')) {
    return operands.slice(0, 1).flatMap((path) => resolve(path));
  }

  if ((name === 'perl' || name === 'sed') && args.some((word) => /^-\w*i/u.test(word))) {
    return collectInPlaceFiles(args).flatMap((path) => resolve(path));
  }

  if (name === 'ssh-keygen' && args.includes('-f')) {
    return collectPathFindings(
      resolvePath(scope.home, args[args.indexOf('-f') + 1] ?? '', scope.home),
      scope,
    );
  }

  const finding = findProgramFinding(name, args);

  return finding === null ? [] : [finding];
}

const GIT_DIRECTORY_WRITES = new Set([
  'clean',
  'reset',
  'checkout',
  'merge',
  'commit',
  'rm',
  'stash',
]);

function collectGitFindings(
  args: readonly string[],
  cwd: string,
  scope: Readonly<OwnedScope>,
): ScopeFinding[] {
  let directory = cwd;
  let index = 0;

  while (index < args.length && args[index]?.startsWith('-') === true) {
    const option = args[index];

    if (option === '-C') {
      directory = resolvePath(directory, args[index + 1] ?? '', scope.home);
    }

    index += option === '-C' || option === '-c' ? 2 : 1;
  }

  const subcommand = args[index] ?? '';
  const rest = args.slice(index + 1);
  const operands = rest.filter((word) => !word.startsWith('-'));
  const findings: ScopeFinding[] = [];

  if (GIT_DIRECTORY_WRITES.has(subcommand) && !isInScope(directory, scope)) {
    findings.push({ kind: 'path', target: directory });
  }

  if (subcommand === 'worktree' && operands[0] === 'remove' && operands[1] !== undefined) {
    findings.push(...collectPathFindings(resolvePath(directory, operands[1], scope.home), scope));
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
    findings.push(...collectPushFindings(rest, operands, scope));
  }

  return findings;
}

function collectPushFindings(
  rest: readonly string[],
  operands: readonly string[],
  scope: Readonly<OwnedScope>,
): ScopeFinding[] {
  const [remote] = operands;
  const findings: ScopeFinding[] = [];

  if (rest.includes('--all') || rest.includes('--mirror')) {
    findings.push({ kind: 'branch', target: '--all' });
  }

  if (remote !== undefined && remote !== 'origin' && !remote.includes(scope.repository)) {
    findings.push({ kind: 'remote-write', target: remote });
  }

  for (const refspec of operands.slice(1)) {
    const destination = (refspec.split(':').at(-1) ?? refspec).replace(/^\+/u, '');
    const branch = destination.replace(/^refs\/heads\//u, '');

    if (branch !== 'HEAD' && !scope.branches.includes(branch)) {
      findings.push({ kind: 'branch', target: branch });
    }
  }

  return findings;
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
    const isOwned = verb !== 'merge' && scope.pullRequests.includes(number);

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

function collectGhAPIFindings(
  args: readonly string[],
  scope: Readonly<OwnedScope>,
): ScopeFinding[] {
  const methodIndex = args.findIndex((word) => word === '-X' || word === '--method');
  const method = methodIndex === -1 ? 'GET' : (args[methodIndex + 1] ?? '').toUpperCase();
  const hasFields = args.some((word) => /^(?:-f|-F|--field|--raw-field|--input)$/u.test(word));

  if (!hasFields && method === 'GET') {
    return [];
  }

  const endpoint = args.find((word) => !word.startsWith('-') && word.includes('/')) ?? '';
  const owned = /\/(?:pulls|issues)\/(?<number>\d+)(?:\/|$)/u.exec(endpoint)?.groups?.['number'];

  if (
    owned !== undefined &&
    scope.pullRequests.includes(Number(owned)) &&
    !endpoint.includes('/merge')
  ) {
    return [];
  }

  const isCredential = /secret|collaborator|protection|key|permission/u.test(endpoint);

  return [{ kind: isCredential ? 'credential' : 'remote-write', target: `gh api ${endpoint}` }];
}

function findProgramFinding(name: string, args: readonly string[]): ScopeFinding | null {
  const joined = args.join(' ');

  const isUpload = args.some((word) =>
    /^-[a-zA-Z]*[dFT]$|^--(?:data\S*|form|upload-file)$/u.test(word),
  );

  const isWriteMethod = /-X\s*(?:POST|PUT|PATCH|DELETE)/u.test(joined);

  if (name === 'op' && /^(?:item|vault|document) (?:edit|create|delete)\b/u.test(joined)) {
    return { kind: 'credential', target: `op ${args[0] ?? ''} ${args[1] ?? ''}` };
  }

  if (name === 'aws' && args[0] === 'iam') {
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

  if (name === 'curl' && (isUpload || isWriteMethod) && !/localhost|127\.0\.0\.1/u.test(joined)) {
    return { kind: 'remote-write', target: 'curl upload' };
  }

  if ((name === 'scp' || name === 'ssh') && args.some((word) => word.includes('@'))) {
    return { kind: 'remote-write', target: name };
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

function collectRedirectTargets(text: string): string[] {
  return [...text.matchAll(/(?<![<&\d])>{1,2}\s*(?<target>[^\s;&|<>']+)/gu)]
    .map((match) => match.groups?.['target'] ?? '')
    .filter((target) => target !== '');
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

// Drops leading environment assignments and wrappers (env, sudo, timeout) and
// every redirection, so the first word is the program and the rest its arguments.
function getCommandWords(words: readonly string[]): readonly string[] {
  let index = 0;

  while (index < words.length) {
    const word = words[index] ?? '';

    if (/^\w+=/u.test(word) || word === 'sudo' || word === 'command') {
      index += 1;
    } else if (word === 'env') {
      index += 1;

      while (words[index] === '-u' || /^\w+=/u.test(words[index] ?? '')) {
        index += words[index] === '-u' ? 2 : 1;
      }
    } else if (word === 'timeout') {
      index += 2;
    } else {
      break;
    }
  }

  return words
    .slice(index)
    .filter(
      (word, position, all) =>
        !/^\d*[<>]/u.test(word) && !/^\d*>{1,2}$/u.test(all[position - 1] ?? ''),
    );
}

function splitWords(text: string): string[] {
  const words: string[] = [];
  let current = '';
  let quote: string | null = null;
  let started = false;

  for (const ch of text) {
    if (quote !== null) {
      if (ch === quote) {
        quote = null;
      } else {
        current += ch;
      }
    } else if (ch === "'" || ch === '"') {
      quote = ch;
      started = true;
    } else if (/\s/u.test(ch)) {
      if (started) {
        words.push(current);
      }

      current = '';
      started = false;
    } else {
      current += ch;
      started = true;
    }
  }

  if (started) {
    words.push(current);
  }

  return words;
}

function resolvePath(cwd: string, path: string, home: string): string {
  const expanded = path.replace(/^(?:~|\$HOME|\$\{HOME\})(?=\/|$)/u, home);
  const absolute = isAbsolute(expanded) ? expanded : join(cwd, expanded);

  return normalize(absolute).replace(/\/$/u, '');
}

const SCRATCH_PATHS = ['/tmp', '/dev/null', '/dev/stdout', '/dev/stderr'];

// A worktree nested under another, as `.worktrees/<name>` is, belongs to its own
// task: being inside the parent checkout does not put it in the parent's scope.
function isInScope(path: string, scope: Readonly<OwnedScope>): boolean {
  if (SCRATCH_PATHS.some((entry) => isUnder(path, entry))) {
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
