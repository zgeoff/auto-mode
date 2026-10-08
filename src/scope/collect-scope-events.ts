import { isAbsolute, join, normalize } from 'node:path';
import { splitCommandWords } from '../rules/split-command-words.ts';
import { splitShellCommand } from '../rules/split-shell-command.ts';
import type { ScopeEvent } from './types.ts';

// Reads only the command text. An event is a claim the command may have made
// something; the caller confirms each one against the checkout before the
// session's scope takes it.
export function collectScopeEvents(command: string, cwd: string, home: string): ScopeEvent[] {
  const events: ScopeEvent[] = [];
  const hasPipe = /(?<!\|)\|(?!\|)/u.test(command);
  let directory: string | null = cwd;

  for (const segment of splitShellCommand(command).segments) {
    const [name, ...args] = splitCommandWords(segment.text);

    if (name === 'cd') {
      // A `cd` inside a pipeline runs in a subshell, and the segments do not
      // keep their separators, so a pipe leaves the directory unknown.
      directory = hasPipe ? null : resolvePath(directory, args[0] ?? home, home);
    } else if (name === 'git' && directory !== null) {
      events.push(...collectGitEvents(args, directory, home));
    } else if (name === 'gh' && directory !== null && args[0] === 'pr' && args[1] === 'create') {
      events.push({
        kind: 'pull-request',
        directory,
        head: findOptionValue(args, ['--head', '-H']),
      });
    }
  }

  return events;
}

const BRANCH_CREATE_OPTIONS = new Set(['-b', '-B', '-c', '-C', '--create', '--force-create']);

// `git branch` names a branch to create only when no option turns it into a
// listing, a rename, a copy, a deletion, or an upstream change.
const BRANCH_OTHER_OPTIONS =
  /^-(?:d|D|m|M|c|C|l|a|r|v|vv|u)$|^--(?:delete|move|copy|list|all|remotes|verbose|show-current|contains|no-contains|merged|no-merged|points-at|format|sort|set-upstream-to|unset-upstream|edit-description)/u;

function collectGitEvents(args: readonly string[], cwd: string, home: string): ScopeEvent[] {
  let directory: string | null = cwd;
  let index = 0;

  while (index < args.length && args[index]?.startsWith('-') === true) {
    if (args[index] === '-C') {
      directory = resolvePath(directory, args[index + 1] ?? '', home);
    }

    index += args[index] === '-C' || args[index] === '-c' ? 2 : 1;
  }

  const subcommand = args[index];
  const rest = args.slice(index + 1);

  if (directory === null) {
    return [];
  }

  if (subcommand === 'worktree' && rest[0] === 'add') {
    const path = findWorktreePath(rest.slice(1));
    const resolved = path === null ? null : resolvePath(directory, path, home);

    return resolved === null ? [] : [{ kind: 'worktree', path: resolved }];
  }

  if (subcommand === 'checkout' || subcommand === 'switch') {
    const name = findOptionValue(rest, [...BRANCH_CREATE_OPTIONS]);

    return name === null ? [] : [{ kind: 'branch', name, directory }];
  }

  if (subcommand === 'branch' && !rest.some((word) => BRANCH_OTHER_OPTIONS.test(word))) {
    const name = rest.find((word) => !word.startsWith('-'));

    return name === undefined || isUnresolved(name) ? [] : [{ kind: 'branch', name, directory }];
  }

  return [];
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

function findOptionValue(args: readonly string[], options: readonly string[]): string | null {
  const index = args.findIndex((word) => options.includes(word));
  const value = index === -1 ? undefined : args[index + 1];

  return value === undefined || isUnresolved(value) ? null : value;
}

function isUnresolved(word: string): boolean {
  return /[$`]/u.test(word);
}

function resolvePath(directory: string | null, path: string, home: string): string | null {
  const expanded = path.replace(/^(?:~|\$HOME|\$\{HOME\})(?=\/|$)/u, home);

  if (isUnresolved(expanded) || expanded.startsWith('~') || expanded === '') {
    return null;
  }

  if (!isAbsolute(expanded) && directory === null) {
    return null;
  }

  const absolute =
    isAbsolute(expanded) || directory === null ? expanded : join(directory, expanded);

  return normalize(absolute).replace(/(?<=.)\/$/u, '');
}
