import { SCRATCH_PATHS } from '../config/scratch-paths.ts';
import { toRepositorySlug } from '../git/to-repository-slug.ts';
import type { OwnedScope } from '../scope/types.ts';
import { collectShellCommands } from '../shell/collect-shell-commands.ts';
import type { ShellCommand } from '../shell/collect-shell-commands.ts';
import { collectShellScripts } from '../shell/collect-shell-scripts.ts';
import { isUnresolvedWord } from '../shell/is-unresolved-word.ts';
import { splitGitCommand } from '../shell/split-git-command.ts';
import { splitShellCommand } from '../shell/split-shell-command.ts';
import { splitShellTokens } from '../shell/split-shell-tokens.ts';
import { collectProgramFindings } from './collect-program-findings.ts';
import { collectTargetFindings } from './collect-target-findings.ts';
import { isInScope } from './is-in-scope.ts';
import type { ScopeFinding } from './types.ts';

interface ScopeAction {
  readonly tool: string;
  readonly cwd: string;
  readonly input: Readonly<Record<string, unknown>>;
}

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
      ? collectCommandFindings(command, action.cwd, action.cwd, scope, scratchPaths)
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

  if (isOwned) {
    return [];
  }

  return typeof number === 'number'
    ? [{ kind: 'remote-write', target: action.tool, grant: { kind: 'pull-request', number } }]
    : [{ kind: 'remote-write', target: action.tool }];
}

// A substitution or a shell's heredoc script runs commands of its own, so the
// check reads each one from the directory its segment runs in.
function collectCommandFindings(
  command: string,
  directory: string | null,
  cwd: string,
  scope: Readonly<OwnedScope>,
  scratchPaths: readonly string[],
): ScopeFinding[] {
  const findings: ScopeFinding[] = [];
  const entries = collectShellCommands(command, directory, scope.home);
  const piped = collectPipedSegments(command);
  const segments = splitShellCommand(command).segments;
  const scripts = collectShellScripts(command);

  for (const [index, entry] of entries.entries()) {
    const [name, ...args] = entry.words;
    const fixed = findFixedXargsCommand(entry.words, segments[index]?.text ?? '');

    if (fixed !== null) {
      findings.push(
        ...collectCallFindings(fixed.name, fixed.args, entry.directory, cwd, scope, scratchPaths),
      );
    } else if (isBranchSweep(entries.slice(0, index + 1), piped.slice(0, index + 1))) {
      findings.push({ kind: 'discard', target: 'git branch delete by exclusion' });
    }

    for (const target of entry.writeTargets) {
      findings.push(...collectTargetFindings(entry.directory, target, scope, scratchPaths));
    }

    if (name !== undefined && name !== 'cd') {
      findings.push(...collectCallFindings(name, args, entry.directory, cwd, scope, scratchPaths));
    }

    for (const script of scripts.filter((candidate) => candidate.segment === index)) {
      findings.push(
        ...collectCommandFindings(script.text, entry.directory, cwd, scope, scratchPaths),
      );
    }
  }

  return findings;
}

// One flag per segment: whether a pipe joins it to the segment before it. The
// segments are the runs of tokens between separators, as the shell split cuts them.
function collectPipedSegments(command: string): boolean[] {
  const piped: boolean[] = [];
  let separator: string | null = null;
  let isInSegment = false;

  for (const token of splitShellTokens(command).tokens) {
    if (token.kind === 'separator') {
      separator = token.operator;
      isInSegment = false;
    } else if (!isInSegment && token.kind !== 'comment' && token.kind !== 'heredoc') {
      piped.push(separator === '|');

      isInSegment = true;
    }
  }

  return piped;
}

const XARGS_FLAG = /^(?:-[0oprtx]+|--(?:null|no-run-if-empty|verbose|interactive|exit|open-tty))$/u;
const XARGS_VALUE_OPTION = /^-[EPads]$/u;

const XARGS_ATTACHED_VALUE =
  /^(?:-[EPads].|--(?:eof|max-procs|delimiter|arg-file|max-chars|process-slot-var)=)/u;

const XARGS_REPLACE = /^(?:-I(?<attached>.+)|-i(?<short>.*)|--replace(?:=(?<long>.*))?)$/u;

// The shell can expand, unquote or unescape a word into the replacement token,
// so only a segment written in plain literal words shows that the token is missing.
const PLAIN_WORD = /^(?:[\w./:@%+=-]|\{\})+$/u;

// In replacement mode xargs runs the command once per listed name, putting the
// name only where the token stands, so a command without the token runs as
// written. `-n` or `-L` beside it appends names again, so either one rules it out.
function findFixedXargsCommand(
  words: readonly string[],
  text: string,
): { readonly name: string; readonly args: readonly string[] } | null {
  if (
    words[0] !== 'xargs' ||
    !splitShellTokens(text).tokens.every(
      (token) =>
        token.kind !== 'word' || (token.raw === token.value && PLAIN_WORD.test(token.value)),
    )
  ) {
    return null;
  }

  let token: string | null = null;
  let start = 1;

  while (words[start]?.startsWith('-') === true) {
    const word = words[start] ?? '';
    const replace = XARGS_REPLACE.exec(word)?.groups;

    if (word === '--') {
      start += 1;
      break;
    }

    if (word === '-I') {
      token = words[start + 1] ?? null;
      start += 2;
    } else if (replace !== undefined) {
      const short = replace['short'];

      token =
        replace['attached'] ??
        replace['long'] ??
        (short === undefined || short === '' ? '{}' : short);

      start += 1;
    } else if (word.startsWith('-J')) {
      // BSD `-J` puts the names where its token stands, or after the command
      // when no word matches it, so the later of `-I` and `-J` decides the mode.
      token = null;
      start += word === '-J' ? 2 : 1;
    } else if (XARGS_VALUE_OPTION.test(word)) {
      start += 2;
    } else if (XARGS_FLAG.test(word) || XARGS_ATTACHED_VALUE.test(word)) {
      start += 1;
    } else {
      return null;
    }
  }

  const [name, ...args] = words.slice(start);

  if (
    token === null ||
    token === '' ||
    name === undefined ||
    [name, ...args].some((word) => word.includes(token))
  ) {
    return null;
  }

  return { name, args };
}

const XARGS_VALUE_OPTIONS = new Set(['-I', '-J', '-L', '-n', '-P', '-s', '-d', '-E']);

// A branch list that only drops names, piped into `git branch -d`, deletes
// branches no one named. A list that selects names by a pattern goes to the
// classifier, and so does a filter the check cannot read.
function isBranchSweep(entries: readonly ShellCommand[], piped: readonly boolean[]): boolean {
  const deleter = entries.at(-1)?.words ?? [];

  if (deleter[0] !== 'xargs' || piped.at(-1) !== true) {
    return false;
  }

  let start = 1;

  while (deleter[start]?.startsWith('-') === true) {
    // `xargs -a FILE` reads its names from the file, not from the pipe.
    if (/^(?:-a|--arg-file)/u.test(deleter[start] ?? '')) {
      return false;
    }

    start += XARGS_VALUE_OPTIONS.has(deleter[start] ?? '') ? 2 : 1;
  }

  const [program, subcommand, ...rest] = deleter.slice(start);

  if (
    program !== 'git' ||
    subcommand !== 'branch' ||
    !rest.some((word) => /^-(?:d|D|-delete)$/u.test(word))
  ) {
    return false;
  }

  let first = entries.length - 2;

  while (first > 0 && piped[first] === true) {
    first -= 1;
  }

  const [listing, ...filters] = entries.slice(first, -1).map((entry) => entry.words);

  return (
    listing !== undefined &&
    isWholeBranchListing(listing) &&
    filters.every((filter) => isExcludingFilter(filter))
  );
}

function isWholeBranchListing(words: readonly string[]): boolean {
  const [program, subcommand, ...rest] = words;

  if (program !== 'git') {
    return false;
  }

  if (subcommand === 'branch') {
    return rest.every((word) =>
      /^(?:-a|-r|-v|-vv|--all|--remotes|--no-color|--format=.*)$/u.test(word),
    );
  }

  if (subcommand !== 'for-each-ref') {
    return false;
  }

  // `--format` and `--sort` take their value as the next word, which names no
  // ref. Every other option, such as `--merged` or `--contains`, selects refs.
  const kept = rest.filter((_word, index) => !/^--(?:format|sort)$/u.test(rest[index - 1] ?? ''));

  return kept.every(
    (word) => /^--(?:format|sort)(?:=.*)?$/u.test(word) || /^refs\/heads\/?$/u.test(word),
  );
}

const NAME_EDITORS = new Set(['tr', 'cut', 'sort']);

function isExcludingFilter(words: readonly string[]): boolean {
  const [program, ...args] = words;

  if (program === 'grep' || program === 'egrep') {
    return args.some((word) => /^-[a-zA-Z]*v[a-zA-Z]*$|^--invert-match$/u.test(word));
  }

  if (program === 'sed') {
    return isSubstitutionOnly(args);
  }

  if (program === 'uniq') {
    return args.every((word) => !/^-[a-zA-Z]*[dDu]/u.test(word));
  }

  return program !== undefined && NAME_EDITORS.has(program);
}

// A sed script can delete or print by pattern, so only one substitution that
// rewrites each name, such as stripping the current-branch marker, passes.
function isSubstitutionOnly(args: readonly string[]): boolean {
  const scripts = args.filter((word) => word !== '-e' && word !== '-E' && word !== '-r');

  return (
    scripts.length > 0 &&
    scripts.every((script) =>
      /^s(?<delimiter>[^\w\s;])(?:(?!\k<delimiter>).)*\k<delimiter>(?:(?!\k<delimiter>).)*\k<delimiter>g?$/u.test(
        script,
      ),
    )
  );
}

function collectCallFindings(
  name: string,
  args: readonly string[],
  directory: string | null,
  cwd: string,
  scope: Readonly<OwnedScope>,
  scratchPaths: readonly string[],
): ScopeFinding[] {
  if (name === 'git') {
    return collectGitFindings(args, directory, cwd, scope, scratchPaths);
  }

  if (name === 'gh') {
    return collectGhFindings(args, scope);
  }

  return [
    ...collectProgramFindings(name, args, { directory, scope, scratchPaths }),
    ...collectRecordFindings(name, args),
  ];
}

// The mod alone reports finished calls; a record the agent sends is a claim
// on scope it did not make, whether it names the bin, a runner, or the script.
function collectRecordFindings(name: string, args: readonly string[]): ScopeFinding[] {
  const words = [name, ...args];
  const launcher = words.findIndex((word) => word.includes('auto-mode'));

  return launcher !== -1 && words.slice(launcher + 1).includes('record')
    ? [{ kind: 'credential', target: 'auto-mode record' }]
    : [];
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
  const git = splitGitCommand(args, directory, scope.home);
  const gitDirectory = git.directory;
  const [subcommand = '', ...rest] = git.args;
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
      findings.push({ kind: 'branch', target: branch, grant: { kind: 'branch' } });
    }
  }

  // A hard reset onto another commit drops the commits after it and every
  // uncommitted change, and the text cannot tell whose work those were.
  const [resetTarget] = operands;

  if (
    subcommand === 'reset' &&
    rest.includes('--hard') &&
    resetTarget !== undefined &&
    resetTarget !== 'HEAD' &&
    resetTarget !== '@' &&
    !isUnresolvedWord(resetTarget)
  ) {
    findings.push({ kind: 'discard', target: `git reset --hard ${resetTarget}` });
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

  if (remote !== undefined && !isUnresolvedWord(remote) && !isOwnedRemote(remote, scope)) {
    findings.push({ kind: 'remote-write', target: remote });
  }

  const destinations = refspecs.length === 0 && !rest.includes('--tags') ? ['HEAD'] : refspecs;

  for (const refspec of destinations) {
    const destination = (refspec.split(':').at(-1) ?? refspec).replace(/^\+/u, '');
    const named = destination.replace(/^refs\/heads\//u, '');
    const branch = named === 'HEAD' ? currentBranch : named;

    if (
      branch !== null &&
      !isUnresolvedWord(branch) &&
      !branch.startsWith('refs/tags/') &&
      !scope.branches.includes(branch)
    ) {
      findings.push({ kind: 'branch', target: branch, grant: { kind: 'branch' } });
    }
  }

  return findings;
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
    const pull = findPullRequestSelector(verb, args.slice(2));
    const number = pull?.number ?? Number.NaN;
    const isOwned = verb !== 'merge' && isOwnedPullRequest(number, pull?.repo, scope);
    const isAdmin = args.some((word) => /^--admin(?:=|$)/u.test(word));

    if (isOwned) {
      return [];
    }

    // An admin merge bypasses the forge's own branch protection, so no message
    // can grant it.
    return Number.isInteger(number) && !isAdmin
      ? [{ kind: 'remote-write', target: `gh pr ${verb}`, grant: { kind: 'pull-request', number } }]
      : [{ kind: 'remote-write', target: `gh pr ${verb}` }];
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

// The options of each gh pr write command that take a value as the next word,
// from gh 2.102. A short flag can take a value under one command and none under
// another: `-m` names a milestone for `edit` and picks the merge method for `merge`.
const GH_PR_VALUE_OPTIONS: Readonly<Record<string, ReadonlySet<string>>> = {
  comment: new Set(['-b', '--body', '-F', '--body-file', '--attach']),
  merge: new Set([
    '-A',
    '--author-email',
    '-b',
    '--body',
    '-F',
    '--body-file',
    '--match-head-commit',
    '-t',
    '--subject',
  ]),
  edit: new Set([
    '--add-assignee',
    '--add-label',
    '--add-project',
    '--add-reviewer',
    '--attach',
    '-B',
    '--base',
    '-b',
    '--body',
    '-F',
    '--body-file',
    '-m',
    '--milestone',
    '--remove-assignee',
    '--remove-label',
    '--remove-project',
    '--remove-reviewer',
    '-t',
    '--title',
  ]),
  close: new Set(['-c', '--comment']),
  review: new Set(['-b', '--body', '-F', '--body-file']),
  ready: new Set(),
  reopen: new Set(['-c', '--comment']),
};

// Every gh pr command takes the repository option.
const GH_REPO_OPTIONS = new Set(['-R', '--repo']);

// gh selects the pull request by its first positional word: a number, a pull
// request URL, or a branch, which names no number. A URL names its repository.
function findPullRequestSelector(
  verb: string,
  args: readonly string[],
): { readonly number: number | null; readonly repo: string | undefined } | null {
  const valueOptions = GH_PR_VALUE_OPTIONS[verb] ?? new Set<string>();
  let repo: string | undefined;
  let selector: string | undefined;

  for (let index = 0; index < args.length; index += 1) {
    const word = args[index] ?? '';

    if (GH_REPO_OPTIONS.has(word)) {
      repo = args[index + 1];
    } else if (word.startsWith('--repo=')) {
      repo = word.slice('--repo='.length);
    }

    if (GH_REPO_OPTIONS.has(word) || valueOptions.has(word)) {
      index += 1;
    } else if (selector === undefined && !word.startsWith('-')) {
      selector = word;
    }
  }

  if (selector === undefined) {
    return null;
  }

  const url = /^https?:\/\/(?<repo>[^/]+\/[^/]+\/[^/]+)\/pull\/(?<number>\d+)(?:[/?#]|$)/u.exec(
    selector,
  )?.groups;

  if (url !== undefined) {
    return { number: Number(url['number']), repo: url['repo'] };
  }

  return { number: /^#?\d+$/u.test(selector) ? Number(selector.replace('#', '')) : null, repo };
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
