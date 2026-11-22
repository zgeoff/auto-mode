import { SCOPE_COMMANDS } from '../../mods/auto-mode/contract/scope-commands.ts';
import { collectShellCommands } from '../shell/collect-shell-commands.ts';
import { isUnresolvedWord } from '../shell/is-unresolved-word.ts';
import { parseShellCommand } from '../shell/parse-shell-command.ts';
import { resolveShellPath } from '../shell/resolve-shell-path.ts';
import { splitGitCommand } from '../shell/split-git-command.ts';
import type { ScopeEvent } from './types.ts';

// A command unbash cannot read whole may run other words than the tree shows,
// and a compound command's body may never run, so neither creates anything
// the session scope takes on.
export function collectScopeEvents(command: string, cwd: string, home: string): ScopeEvent[] {
  const tree = parseShellCommand(command);

  if (tree.hasError) {
    return [];
  }

  return collectShellCommands(tree, cwd, home).flatMap((entry, index) => {
    const [name, ...args] = entry.words;
    const directory = entry.directory;
    const scopes = tree.segments[index]?.scopes ?? [];

    if (directory === null || scopes.some((scope) => scope.kind === 'conditional')) {
      return [];
    }

    if (name === 'git') {
      return collectGitEvents(args, directory, home);
    }

    return name === 'gh' && findScopeCommand(SCOPE_COMMANDS.gh, args) !== null
      ? [{ kind: 'pull-request', directory, head: findOptionValue(args, ['--head', '-H']) }]
      : [];
  });
}

type GitEventCollector = (rest: readonly string[], directory: string, home: string) => ScopeEvent[];

const GIT_EVENT_COLLECTORS: Record<(typeof SCOPE_COMMANDS.git)[number], GitEventCollector> = {
  'worktree add': collectWorktreeEvents,
  checkout: collectSwitchEvents,
  switch: collectSwitchEvents,
  branch: collectBranchEvents,
};

function collectGitEvents(args: readonly string[], cwd: string, home: string): ScopeEvent[] {
  const git = splitGitCommand(args, cwd, home);
  const found = findScopeCommand(SCOPE_COMMANDS.git, git.args);

  if (git.directory === null || found === null) {
    return [];
  }

  return GIT_EVENT_COLLECTORS[found.command](found.rest, git.directory, home);
}

interface FoundScopeCommand<C extends string> {
  readonly command: C;
  readonly rest: readonly string[];
}

function findScopeCommand<C extends string>(
  commands: readonly C[],
  args: readonly string[],
): FoundScopeCommand<C> | null {
  for (const command of commands) {
    const words = command.split(' ');

    if (words.every((word, index) => args[index] === word)) {
      return { command, rest: args.slice(words.length) };
    }
  }

  return null;
}

function collectWorktreeEvents(
  rest: readonly string[],
  directory: string,
  home: string,
): ScopeEvent[] {
  const path = findWorktreePath(rest);
  const resolved = path === null ? null : resolveShellPath(directory, path, home);

  return resolved === null ? [] : [{ kind: 'worktree', path: resolved }];
}

const WORKTREE_VALUE_OPTIONS = new Set(['-b', '-B', '--reason']);

function findWorktreePath(args: readonly string[]): string | null {
  for (let index = 0; index < args.length; index += 1) {
    const word = args[index] ?? '';

    if (WORKTREE_VALUE_OPTIONS.has(word)) {
      index += 1;
    } else if (!word.startsWith('-')) {
      return word;
    }
  }

  return null;
}

const BRANCH_CREATE_OPTIONS = new Set(['-b', '-B', '-c', '-C', '--create', '--force-create']);

// `git branch` names a branch to create only when no option turns it into a
// listing, a rename, a copy, a deletion, or an upstream change.
const BRANCH_OTHER_OPTIONS =
  /^-(?:d|D|m|M|c|C|l|a|r|v|vv|u)$|^--(?:delete|move|copy|list|all|remotes|verbose|show-current|contains|no-contains|merged|no-merged|points-at|format|sort|set-upstream-to|unset-upstream|edit-description)/u;

function collectSwitchEvents(rest: readonly string[], directory: string): ScopeEvent[] {
  const name = findOptionValue(rest, [...BRANCH_CREATE_OPTIONS]);

  return name === null ? [] : [{ kind: 'branch', name, directory }];
}

function findOptionValue(args: readonly string[], options: readonly string[]): string | null {
  const index = args.findIndex((word) => options.includes(word));
  const value = index === -1 ? undefined : args[index + 1];

  return value === undefined || isUnresolvedWord(value) ? null : value;
}

function collectBranchEvents(rest: readonly string[], directory: string): ScopeEvent[] {
  if (rest.some((word) => BRANCH_OTHER_OPTIONS.test(word))) {
    return [];
  }

  const name = rest.find((word) => !word.startsWith('-'));

  return name === undefined || isUnresolvedWord(name) ? [] : [{ kind: 'branch', name, directory }];
}
