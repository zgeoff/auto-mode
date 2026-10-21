import { resolve, sep } from 'node:path';
import type { HookFacts } from '../git/types.ts';
import { isUnresolvedWord } from '../shell/is-unresolved-word.ts';
import { splitCommandWords } from '../shell/split-command-words.ts';
import type { GitConfigOption } from '../shell/split-git-command.ts';
import { splitGitCommand } from '../shell/split-git-command.ts';
import { splitShellCommand } from '../shell/split-shell-command.ts';
import { splitShellTokens } from '../shell/split-shell-tokens.ts';
import { toWordValues } from '../shell/to-word-values.ts';

// Each switch is a fixed label, never the command's own text, because the
// labels reach the classifier's trusted instructions. Without the checkout's
// facts, any hooks folder or lefthook config counts as another one.
export function collectHookBypasses(
  command: string,
  cwd: string,
  facts: HookFacts | null,
): readonly string[] {
  const exported = new Map<string, string>();

  const bypasses: string[] = [];
  let segmentFacts = facts;

  for (const segment of splitShellCommand(command).segments) {
    const found = collectSegmentBypasses(segment.text, exported, cwd, segmentFacts);

    if (found === 'moved') {
      segmentFacts = null;
    } else {
      bypasses.push(...found);
    }
  }

  return bypasses;
}

// The gh stack commands that commit or push through git, and so run its hooks.
const GH_STACK_WRITES: ReadonlySet<string> = new Set(['add', 'push', 'submit', 'sync']);
const DIRECTORY_CHANGES: ReadonlySet<string> = new Set(['cd', 'pushd', 'popd']);

function collectSegmentBypasses(
  text: string,
  exported: Map<string, string>,
  cwd: string,
  facts: HookFacts | null,
): readonly string[] | 'moved' {
  const words = splitShellTokens(text).tokens.flatMap((token) => toWordValues(token));
  const program = splitCommandWords(text);
  const [name = '', ...args] = program;
  const prefix = words.slice(0, words.length - program.length);
  const programName = name.slice(name.lastIndexOf('/') + 1);

  if (DIRECTORY_CHANGES.has(programName)) {
    return 'moved';
  }

  if (programName === 'export' && prefix.length === 0) {
    for (const arg of args.filter((word) => /^\w+=/u.test(word))) {
      exported.set(arg.slice(0, arg.indexOf('=')), arg);
    }

    return [];
  }

  // A bare assignment changes a variable the shell already exports.
  if (program.length === 0) {
    for (const word of prefix.filter((entry) => /^\w+=/u.test(entry))) {
      const variable = word.slice(0, word.indexOf('='));

      if (exported.has(variable)) {
        exported.set(variable, word);
      }
    }

    return [];
  }

  if (programName === 'unset' && prefix.length === 0) {
    for (const arg of args) {
      exported.delete(arg);
    }

    return [];
  }

  if (programName === 'gh') {
    return args[0] === 'stack' && GH_STACK_WRITES.has(args[1] ?? '')
      ? collectHookSwitches(buildReachingVariables(prefix, exported), [], facts)
      : [];
  }

  if (programName !== 'git') {
    return [];
  }

  const git = splitGitCommand(args, cwd, '');
  const [subcommand, ...subArgs] = git.args;

  if (subcommand !== 'commit' && subcommand !== 'push') {
    return [];
  }

  const isInWorktree =
    facts !== null &&
    git.directory !== null &&
    (git.directory === facts.worktree || git.directory.startsWith(`${facts.worktree}${sep}`));

  const worktreeFacts = isInWorktree ? facts : null;
  const option = findNoVerifyOption(subArgs, subcommand);

  return [
    ...collectHookSwitches(buildReachingVariables(prefix, exported), git.config, worktreeFacts),
    ...(option === null ? [] : [option]),
  ];
}

// lefthook skips its hooks for `0` or `false`, and husky for `0` alone. lefthook
// leaves out each step or tag that LEFTHOOK_EXCLUDE names. lefthook 2.2.1 reads
// no LEFTHOOK_SKIP, so an agent that sets it means to leave a step out.
const HOOK_SWITCH_NAMES = [
  'LEFTHOOK',
  'HUSKY',
  'LEFTHOOK_EXCLUDE',
  'LEFTHOOK_SKIP',
  'LEFTHOOK_CONFIG',
] as const;

function collectHookSwitches(
  reaching: ReadonlyMap<string, string>,
  config: readonly GitConfigOption[],
  facts: HookFacts | null,
): readonly string[] {
  const switches = HOOK_SWITCH_NAMES.flatMap((name) => {
    const word = reaching.get(name);

    const label =
      word === undefined ? null : findSwitchLabel(name, word.slice(name.length + 1), facts);

    return label === null ? [] : [label];
  });

  const hooksPath = findHooksPath(reaching, config);

  return hooksPath === undefined || isKeptHooksPath(hooksPath, facts)
    ? switches
    : [...switches, 'core.hooksPath'];
}

function findSwitchLabel(name: string, value: string, facts: HookFacts | null): string | null {
  if (name === 'LEFTHOOK' && (value === '0' || value === 'false')) {
    return `LEFTHOOK=${value}`;
  }

  if (name === 'HUSKY' && value === '0') {
    return 'HUSKY=0';
  }

  if ((name === 'LEFTHOOK_EXCLUDE' || name === 'LEFTHOOK_SKIP') && /[^\s,]/u.test(value)) {
    return name;
  }

  // lefthook loads its usual config for an empty LEFTHOOK_CONFIG, and reads a
  // relative one from the worktree root.
  if (
    name === 'LEFTHOOK_CONFIG' &&
    value !== '' &&
    (facts === null ||
      facts.lefthookConfig === null ||
      !isResolvableWord(value) ||
      resolve(facts.worktree, value) !== facts.lefthookConfig)
  ) {
    return name;
  }

  return null;
}

function isResolvableWord(value: string): boolean {
  return !isUnresolvedWord(value) && !value.startsWith('~');
}

// A `-c` or `--config-env` setting wins over the GIT_CONFIG_COUNT variables,
// and within each source the last setting wins. A `--config-env` variable this
// command does not set has a value the command text cannot show.
function findHooksPath(
  reaching: ReadonlyMap<string, string>,
  config: readonly GitConfigOption[],
): string | null | undefined {
  const fromOptions = config.flatMap((option) => {
    const separator = option.setting.indexOf('=');

    if (separator === -1 || !isHooksPathKey(option.setting.slice(0, separator))) {
      return [];
    }

    const value = option.setting.slice(separator + 1);

    if (option.source === 'value') {
      return [value];
    }

    const word = reaching.get(value);

    return [word === undefined ? null : word.slice(value.length + 1)];
  });

  if (fromOptions.length > 0) {
    return fromOptions.at(-1);
  }

  const count = Number(reaching.get('GIT_CONFIG_COUNT')?.slice('GIT_CONFIG_COUNT='.length));

  const fromVariables = [...reaching.entries()]
    .flatMap(([name, word]) => {
      const index = Number(/^GIT_CONFIG_KEY_(?<index>0|[1-9]\d*)$/u.exec(name)?.groups?.['index']);
      const value = reaching.get(`GIT_CONFIG_VALUE_${index}`);

      return index < count && value !== undefined && isHooksPathKey(word.slice(name.length + 1))
        ? [{ index, value: value.slice(value.indexOf('=') + 1) }]
        : [];
    })
    .toSorted((left, right) => left.index - right.index);

  return fromVariables.at(-1)?.value;
}

// git reads a config key's section and name without case.
function isHooksPathKey(key: string): boolean {
  return key.toLowerCase() === 'core.hookspath';
}

// An empty core.hooksPath runs no hooks. git reads a relative one from the
// worktree root.
function isKeptHooksPath(value: string | null, facts: HookFacts | null): boolean {
  return (
    value !== null &&
    value !== '' &&
    facts !== null &&
    isResolvableWord(value) &&
    resolve(facts.worktree, value) === facts.hooksDirectory
  );
}

// The words before the program set and unset variables in order, over what an
// earlier export left: a later assignment replaces an earlier one, and
// `env -u NAME` removes it, so only the last state of each name reaches git.
function buildReachingVariables(
  prefix: readonly string[],
  exported: ReadonlyMap<string, string>,
): ReadonlyMap<string, string> {
  const reaching = new Map(exported);

  for (let index = 0; index < prefix.length; index += 1) {
    const word = prefix[index] ?? '';
    const name = word.slice(0, word.indexOf('='));

    if (word === '-u') {
      reaching.delete(prefix[index + 1] ?? '');

      index += 1;
    } else if (/^\w+$/u.test(name)) {
      reaching.set(name, word);
    }
  }

  return reaching;
}

const COMMIT_VALUED_LONG: ReadonlySet<string> = new Set([
  'author',
  'cleanup',
  'date',
  'file',
  'fixup',
  'message',
  'pathspec-from-file',
  'reedit-message',
  'reuse-message',
  'squash',
  'template',
  'trailer',
]);

// git keeps the last of `--no-verify` and `--verify`, so a later `--verify`
// runs the hooks again.
function findNoVerifyOption(args: readonly string[], subcommand: 'commit' | 'push'): string | null {
  let found: string | null = null;
  let index = 0;

  while (index < args.length && args[index] !== '--') {
    const arg = args[index] ?? '';

    if (arg.startsWith('--')) {
      const [option = '', ...value] = arg.slice(2).split('=');

      // git accepts an unambiguous prefix of a long option, such as `--no-veri`.
      if (option.startsWith('no-ve') && 'no-verify'.startsWith(option)) {
        found = '--no-verify';
      } else if (option.startsWith('veri') && 'verify'.startsWith(option)) {
        found = null;
      }

      if (
        subcommand === 'commit' &&
        value.length === 0 &&
        COMMIT_VALUED_LONG.has(findCommitOption(option) ?? '')
      ) {
        index += 1;
      }
    } else if (subcommand === 'commit' && arg.startsWith('-') && arg !== '-') {
      // On `git push`, `-n` is `--dry-run` and keeps the hooks.
      const cluster = parseCommitCluster(arg);

      if (cluster.hasNoVerify) {
        found = '-n';
      }

      if (cluster.takesNextWord) {
        index += 1;
      }
    }

    index += 1;
  }

  return found;
}

// The commit options that take no value. git reads a long option from any
// prefix that names one option alone, and an exact name wins over a longer
// one, so `--mess` is `--message` and `--all` is not `--allow-empty`.
const COMMIT_FLAG_LONG: ReadonlySet<string> = new Set([
  'ahead-behind',
  'all',
  'allow-empty',
  'allow-empty-message',
  'amend',
  'branch',
  'dry-run',
  'edit',
  'gpg-sign',
  'include',
  'interactive',
  'long',
  'no-post-rewrite',
  'no-verify',
  'null',
  'only',
  'patch',
  'pathspec-file-nul',
  'porcelain',
  'post-rewrite',
  'quiet',
  'reset-author',
  'short',
  'signoff',
  'status',
  'untracked-files',
  'verbose',
  'verify',
]);

// An ambiguous prefix makes git refuse the commit, so it names no option.
function findCommitOption(option: string): string | null {
  const names = [...COMMIT_VALUED_LONG, ...COMMIT_FLAG_LONG];

  if (names.includes(option)) {
    return option;
  }

  const matches = names.filter((name) => name.startsWith(option));

  return matches.length === 1 ? (matches[0] ?? null) : null;
}

interface CommitCluster {
  readonly hasNoVerify: boolean;
  readonly takesNextWord: boolean;
}

// The commit options that take a value, so the value word is not read as an
// option. A short one takes the rest of its cluster, or else the next word;
// `-u` and `-S` take only the rest.
const COMMIT_VALUED_SHORT = 'CFcmt';
const COMMIT_ATTACHED_SHORT = 'Su';

function parseCommitCluster(arg: string): CommitCluster {
  let hasNoVerify = false;

  for (let index = 1; index < arg.length; index += 1) {
    const letter = arg.charAt(index);

    if (letter === 'n') {
      hasNoVerify = true;
    } else if (COMMIT_ATTACHED_SHORT.includes(letter)) {
      break;
    } else if (COMMIT_VALUED_SHORT.includes(letter)) {
      return { hasNoVerify, takesNextWord: index === arg.length - 1 };
    }
  }

  return { hasNoVerify, takesNextWord: false };
}
