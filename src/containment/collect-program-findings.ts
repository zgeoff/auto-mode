import { toRepositorySlug } from '../git/to-repository-slug.ts';
import type { OwnedScope } from '../scope/types.ts';
import { isUnresolvedWord } from '../shell/is-unresolved-word.ts';
import { resolveShellPath } from '../shell/resolve-shell-path.ts';
import { collectTargetFindings } from './collect-target-findings.ts';
import { isInScope } from './is-in-scope.ts';
import { isOwnedPullRequest } from './is-owned-pull-request.ts';
import { PROGRAM_TABLE } from './program-table.ts';
import type {
  OperandSelector,
  OptionPattern,
  ProgramEntry,
  RuleFinding,
  WriteRule,
} from './program-table.ts';
import type { ScopeFinding } from './types.ts';

interface ProgramContext {
  readonly directory: string | null;
  readonly cwd: string;
  readonly scope: Readonly<OwnedScope>;
  readonly scratchPaths: readonly string[];
}

// Reads one program call through its table entry. A program the table does not
// list writes nothing the check can name, so the classifier judges it.
export function collectProgramFindings(
  name: string,
  args: readonly string[],
  context: Readonly<ProgramContext>,
  table: Readonly<Record<string, ProgramEntry>> = PROGRAM_TABLE,
): ScopeFinding[] {
  const entry = findEntry(table, name);

  return entry === undefined
    ? []
    : collectEntryFindings(entry, [name], args, { ...context, call: [name, ...args] });
}

function findEntry(
  entries: Readonly<Record<string, ProgramEntry>> | undefined,
  name: string,
): ProgramEntry | undefined {
  return entries !== undefined && Object.hasOwn(entries, name) ? entries[name] : undefined;
}

interface EntryContext extends ProgramContext {
  readonly call: readonly string[];
}

function collectEntryFindings(
  entry: Readonly<ProgramEntry>,
  command: readonly string[],
  words: readonly string[],
  context: Readonly<EntryContext>,
): ScopeFinding[] {
  const call = splitProgramCall(entry, words, context.directory, context.scope.home);
  const entryContext = { ...context, directory: call.directory };

  if (call.subcommand !== null) {
    return collectEntryFindings(
      call.subcommand.entry,
      [...command, call.subcommand.name],
      call.subcommand.words,
      entryContext,
    );
  }

  return (entry.writes ?? [])
    .filter((rule) => isRuleApplied(rule, call, context.call))
    .flatMap((rule) => collectRuleFindings(rule, call, command, entryContext));
}

interface CallOption {
  readonly name: string;
  readonly value: string | undefined;
}

interface ProgramCall {
  readonly options: readonly CallOption[];
  readonly operands: readonly string[];
  readonly directory: string | null;
  readonly subcommand: {
    readonly name: string;
    readonly entry: ProgramEntry;
    readonly words: readonly string[];
  } | null;
}

// A directory option moves the directory the program runs in, as `git -C`
// does, so every later relative path resolves against it.
function splitProgramCall(
  entry: Readonly<ProgramEntry>,
  words: readonly string[],
  start: string | null,
  home: string,
): ProgramCall {
  const options: CallOption[] = [];
  const operands: string[] = [];
  const directoryOptions = entry.directoryOptions ?? [];
  let directory = start;
  let isOptionsEnd = false;

  for (let index = 0; index < words.length; index += 1) {
    const word = words[index] ?? '';

    if (isOptionsEnd || !word.startsWith('-') || word === '-') {
      const subcommand = operands.length === 0 ? findSubcommand(entry, word) : undefined;

      if (subcommand !== undefined) {
        return {
          options,
          operands,
          directory,
          subcommand: { name: word, entry: subcommand, words: words.slice(index + 1) },
        };
      }

      operands.push(word);

      isOptionsEnd ||= entry.optionsEndAtOperand === true;
    } else if (word === '--') {
      isOptionsEnd = true;
    } else {
      const split = splitOption(
        [...directoryOptions, ...(entry.valueOptions ?? [])],
        word,
        words[index + 1],
      );

      for (const option of split.options) {
        if (directoryOptions.includes(option.name)) {
          directory = resolveShellPath(directory, option.value ?? '', home);
        }
      }

      options.push(...split.options);

      index += split.isValueNext ? 1 : 0;
    }
  }

  return { options, operands, directory, subcommand: null };
}

function findSubcommand(entry: Readonly<ProgramEntry>, word: string): ProgramEntry | undefined {
  const other = entry.otherSubcommand;

  return (
    findEntry(entry.subcommands, word) ??
    (other !== undefined && (other.pattern?.test(word) ?? true) ? other.entry : undefined)
  );
}

function splitOption(
  valueOptions: readonly OptionPattern[],
  word: string,
  next: string | undefined,
): { readonly options: readonly CallOption[]; readonly isValueNext: boolean } {
  for (const pattern of valueOptions) {
    if (typeof pattern !== 'string') {
      if (pattern.test(word)) {
        return { options: [{ name: word, value: next }], isValueNext: true };
      }
    } else if (word === pattern) {
      return { options: [{ name: pattern, value: next }], isValueNext: true };
    } else if (
      pattern.startsWith('--') ? word.startsWith(`${pattern}=`) : word.startsWith(pattern)
    ) {
      const value = word.slice(pattern.length).replace(/^=/u, '');

      return { options: [{ name: pattern, value }], isValueNext: false };
    }
  }

  return splitOptionCluster(valueOptions, word, next);
}

// A short cluster such as `-Dc` sets each flag before its first value option,
// which takes the rest of the cluster, or the next word when nothing follows.
function splitOptionCluster(
  valueOptions: readonly OptionPattern[],
  word: string,
  next: string | undefined,
): { readonly options: readonly CallOption[]; readonly isValueNext: boolean } {
  const letters = /^-[^-]./u.test(word) ? (word.slice(1).match(/./gu) ?? []) : [];
  const at = letters.findIndex((letter) => valueOptions.includes(`-${letter}`));

  if (at === -1) {
    return { options: [{ name: word, value: undefined }], isValueNext: false };
  }

  const attached = word.slice(at + 2);
  const flags = letters.slice(0, at).map((letter) => ({ name: `-${letter}`, value: undefined }));

  return {
    options: [
      ...flags,
      { name: `-${letters[at] ?? ''}`, value: attached === '' ? next : attached },
    ],
    isValueNext: attached === '',
  };
}

function isRuleApplied(
  rule: Readonly<WriteRule>,
  call: Readonly<ProgramCall>,
  words: readonly string[],
): boolean {
  const optionValue = rule.optionValue;

  return (
    (rule.flags === undefined || hasOption(call, rule.flags)) &&
    !hasOption(call, rule.readFlags ?? []) &&
    (rule.words ?? []).every((pattern) => words.some((word) => pattern.test(word))) &&
    (optionValue === undefined ||
      call.options.some(
        (option) =>
          optionValue.options.includes(option.name) &&
          option.value !== undefined &&
          optionValue.value.test(option.value),
      ))
  );
}

function hasOption(call: Readonly<ProgramCall>, patterns: readonly OptionPattern[]): boolean {
  return call.options.some((option) =>
    patterns.some((pattern) =>
      typeof pattern === 'string' ? option.name === pattern : pattern.test(option.name),
    ),
  );
}

function collectRuleFindings(
  rule: Readonly<WriteRule>,
  call: Readonly<ProgramCall>,
  command: readonly string[],
  context: Readonly<EntryContext>,
): ScopeFinding[] {
  const finding =
    rule.finding === undefined ? null : buildFinding(rule.finding, command, call, context.call);

  const directory = context.directory;

  if (rule.directory === true) {
    return directory === null || isInScope(directory, context.scope, context.scratchPaths)
      ? []
      : [{ kind: 'path', target: directory }];
  }

  if (rule.options === undefined && rule.operands === undefined) {
    return finding === null ? [] : [finding];
  }

  const targets = [
    ...call.options.flatMap((option) =>
      rule.options?.includes(option.name) === true && option.value !== undefined
        ? [option.value]
        : [],
    ),
    ...(rule.operands ?? []).flatMap((selector) => pickOperands(selector, rule, call)),
  ];

  const written = targets.length === 0 && rule.whenNone !== undefined ? [rule.whenNone] : targets;

  return collectRoleFindings(rule, written, finding, call, context);
}

function buildFinding(
  finding: Readonly<RuleFinding>,
  command: readonly string[],
  call: Readonly<ProgramCall>,
  words: readonly string[],
): ScopeFinding {
  const quoted = {
    call: words,
    operand: [...command, ...call.operands.slice(0, 1)],
    command,
  };

  return {
    kind: finding.kind,
    target: finding.target ?? quoted[finding.quote ?? 'command'].join(' '),
  };
}

function collectRoleFindings(
  rule: Readonly<WriteRule>,
  targets: readonly string[],
  finding: ScopeFinding | null,
  call: Readonly<ProgramCall>,
  context: Readonly<EntryContext>,
): ScopeFinding[] {
  const scope = context.scope;

  const resolve = (target: string): ScopeFinding[] =>
    collectTargetFindings(context.directory, target, scope, context.scratchPaths);

  const role = rule.role ?? 'path';

  if (role === 'path') {
    return targets.flatMap((target) => resolve(target));
  }

  if (role === 'branch') {
    return targets
      .filter((branch) => !scope.branches.includes(branch))
      .map((branch) => ({ kind: 'branch', target: branch, grant: { kind: 'branch' } }));
  }

  if (role === 'remote') {
    return targets
      .filter((remote) => !isUnresolvedWord(remote) && !isOwnedRemote(remote, scope))
      .map((remote) => ({ kind: 'remote-write', target: remote }));
  }

  if (role === 'refspec') {
    // The checkout's current branch is known only for the action's own cwd.
    const current = context.directory === context.cwd ? scope.currentBranch : null;

    return targets.flatMap((refspec) => collectRefspecFindings(refspec, current, scope));
  }

  return finding === null ? [] : collectNamedFindings(role, rule, targets, finding, call, context);
}

function isOwnedRemote(remote: string, scope: Readonly<OwnedScope>): boolean {
  if (scope.remotes.some((entry) => entry.name === remote)) {
    return true;
  }

  const slug = toRepositorySlug(remote);

  return slug !== null && scope.remotes.some((entry) => toRepositorySlug(entry.url) === slug);
}

function collectRefspecFindings(
  refspec: string,
  current: string | null,
  scope: Readonly<OwnedScope>,
): ScopeFinding[] {
  const destination = (refspec.split(':').at(-1) ?? refspec).replace(/^\+/u, '');
  const named = destination.replace(/^refs\/heads\//u, '');
  const branch = named === 'HEAD' ? current : named;

  return branch === null ||
    isUnresolvedWord(branch) ||
    branch.startsWith('refs/tags/') ||
    scope.branches.includes(branch)
    ? []
    : [{ kind: 'branch', target: branch, grant: { kind: 'branch' } }];
}

type NamedRole =
  | 'remote-path'
  | 'url'
  | 'remote-command'
  | 'commit'
  | 'pull-request'
  | 'pull-request-merge'
  | 'forge-path';

// The roles that yield the rule's own finding, or nothing when the target is
// one the task owns or one that writes nothing.
function collectNamedFindings(
  role: NamedRole,
  rule: Readonly<WriteRule>,
  targets: readonly string[],
  finding: ScopeFinding,
  call: Readonly<ProgramCall>,
  context: Readonly<EntryContext>,
): ScopeFinding[] {
  if (role === 'remote-path') {
    return targets.flatMap((target) =>
      /^[^/]+:/u.test(target)
        ? [finding]
        : collectTargetFindings(context.directory, target, context.scope, context.scratchPaths),
    );
  }

  if (role === 'url') {
    return isLocalUpload(targets) ? [] : [finding];
  }

  if (role === 'remote-command') {
    return isRemoteRead(targets, rule.reads ?? []) ? [] : [finding];
  }

  if (role === 'commit') {
    // A hard reset onto another commit drops the commits after it and every
    // uncommitted change, and the text cannot tell whose work those were.
    return targets
      .filter((commit) => commit !== 'HEAD' && commit !== '@' && !isUnresolvedWord(commit))
      .map((commit) => ({ kind: finding.kind, target: `${finding.target} ${commit}` }));
  }

  if (role === 'pull-request' || role === 'pull-request-merge') {
    return collectPullRequestFindings(rule, targets[0], finding, call, context.scope);
  }

  return collectForgeFindings(rule, targets[0] ?? '', finding, context.scope);
}

// gh selects the pull request by its first positional word: a number, a pull
// request URL, or a branch, which names no number. A URL names its repository.
function collectPullRequestFindings(
  rule: Readonly<WriteRule>,
  selector: string | undefined,
  finding: ScopeFinding,
  call: Readonly<ProgramCall>,
  scope: Readonly<OwnedScope>,
): ScopeFinding[] {
  const repoOptions = rule.repoOptions ?? [];

  const url = /^https?:\/\/(?<repo>[^/]+\/[^/]+\/[^/]+)\/pull\/(?<number>\d+)(?:[/?#]|$)/u.exec(
    selector ?? '',
  )?.groups;

  const repo =
    url?.['repo'] ?? call.options.findLast((option) => repoOptions.includes(option.name))?.value;

  let number = Number.NaN;

  if (url !== undefined) {
    number = Number(url['number']);
  } else if (selector !== undefined && /^#?\d+$/u.test(selector)) {
    number = Number(selector.replace('#', ''));
  }

  if (rule.role === 'pull-request' && isOwnedPullRequest(number, repo, scope)) {
    return [];
  }

  return Number.isInteger(number) && !hasOption(call, rule.ungrantFlags ?? [])
    ? [{ ...finding, grant: { kind: 'pull-request', number } }]
    : [finding];
}

// A REST path on an owned pull request or its issue passes, unless it merges.
function collectForgeFindings(
  rule: Readonly<WriteRule>,
  path: string,
  finding: ScopeFinding,
  scope: Readonly<OwnedScope>,
): ScopeFinding[] {
  const pull = /^\/?repos\/(?<repo>[^/]+\/[^/]+)\/(?:pulls|issues)\/(?<number>\d+)(?:\/|$)/u.exec(
    path,
  )?.groups;

  if (
    pull !== undefined &&
    isOwnedPullRequest(Number(pull['number']), pull['repo'] ?? '', scope) &&
    !path.includes('/merge')
  ) {
    return [];
  }

  const isCredential = rule.credentialPattern?.test(path) === true;

  return [
    {
      kind: isCredential ? 'credential' : finding.kind,
      target: `${finding.target} ${path}`,
    },
  ];
}

function pickOperands(
  selector: OperandSelector,
  rule: Readonly<WriteRule>,
  call: Readonly<ProgramCall>,
): readonly string[] {
  const operands = call.operands;
  const isNamed = hasOption(call, rule.options ?? []);

  if (selector === 'all') {
    return operands;
  }

  if (selector === 'first') {
    return operands.slice(0, 1);
  }

  if (selector === 'after-first') {
    return operands.slice(1);
  }

  if (selector === 'after-script') {
    return hasOption(call, rule.scriptOptions ?? []) ? operands : operands.slice(1);
  }

  if (isNamed) {
    return selector === 'sources' ? operands : [];
  }

  if (operands.length < 2) {
    return [];
  }

  return selector === 'destination' ? operands.slice(-1) : operands.slice(0, -1);
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '0.0.0.0']);

function isLocalUpload(words: readonly string[]): boolean {
  const hosts = words
    .filter((word) => /^(?:https?:\/\/|localhost\b|127\.)/u.test(word))
    .map(
      (word) =>
        /^(?:https?:\/\/)?(?<host>\[[^\]]+\]|[^/:?#\s]+)/u
          .exec(word)
          ?.groups?.['host']?.toLowerCase() ?? '',
    );

  return hosts.length > 0 && hosts.every((host) => LOCAL_HOSTS.has(host));
}

// A remote command that is one read-only program, with no shell operators or
// newlines, changes nothing on the host. A call with no host runs nothing.
function isRemoteRead(words: readonly string[], reads: readonly string[]): boolean {
  const [host, ...remote] = words;

  if (host === undefined) {
    return true;
  }

  const command = remote.join(' ');
  const [program] = command.trim().split(/\s+/u);

  return reads.includes(program ?? '') && !/[;&|<>`\n\r]|\$\(/u.test(command);
}
