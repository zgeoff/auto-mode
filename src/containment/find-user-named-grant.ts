import { join, normalize } from 'node:path';
import { PROTECTED_BRANCH_NAMES } from '../scope/protected-branch-names.ts';
import type { NamedTarget } from '../types.ts';
import type { ScopeFinding } from './types.ts';

export interface GrantContext {
  readonly home: string;
  readonly defaultBranch: string | null;
}

// A name is necessary and never sufficient: "port the formatter from the
// export-csv worktree" names a source to read. The judge decides whether the
// message asks for this action, so this only finds the word that names each target.
export function findUserNamedGrant(
  findings: readonly ScopeFinding[],
  message: string,
  context: Readonly<GrantContext>,
): NamedTarget[] | null {
  const words = splitMessageWords(message);
  const named: NamedTarget[] = [];

  for (const finding of findings) {
    const namedAs = findNamingWord(finding, words, context);

    if (namedAs === null) {
      return null;
    }

    named.push({ kind: finding.kind, target: finding.target, namedAs });
  }

  return named.length === 0 ? null : named;
}

// A quoted or backticked span stays whole, so a path that holds a space can
// still name its target.
function splitMessageWords(message: string): string[] {
  const quoted = [...message.matchAll(/(?<quote>["'`])(?<text>[^"'`\n]+?)\k<quote>/gu)].map(
    (match) => match.groups?.['text'] ?? '',
  );

  return [...quoted, ...message.split(/[\s"'`()<>[\]{},;*]+/u)]
    .map((word) => word.trim().replace(/[.:!?]+$/u, ''))
    .filter((word) => word !== '');
}

function findNamingWord(
  finding: Readonly<ScopeFinding>,
  words: readonly string[],
  context: Readonly<GrantContext>,
): string | null {
  const grant = finding.grant;

  if (grant === undefined) {
    return null;
  }

  if (grant.kind === 'pull-request') {
    return findPullRequestWord(grant.number, words);
  }

  if (grant.kind === 'path') {
    return findPathWord(finding.target, words, context.home);
  }

  if (PROTECTED_BRANCH_NAMES.has(finding.target) || finding.target === context.defaultBranch) {
    return null;
  }

  return words.find((word) => word === finding.target) ?? null;
}

const PULL_REQUEST_NOUNS = /^(?:pr|pull|request)$/iu;

function findPullRequestWord(number: number, words: readonly string[]): string | null {
  for (const [index, word] of words.entries()) {
    if (
      word === `#${number}` ||
      new RegExp(`^(?:pr|pull)#?${number}$`, 'iu').test(word) ||
      word.endsWith(`/pull/${number}`)
    ) {
      return word;
    }

    const previous = words[index - 1] ?? '';

    if (word === String(number) && PULL_REQUEST_NOUNS.test(previous)) {
      return `${previous} ${word}`;
    }
  }

  return null;
}

// A directory names the paths below it only inside one worktree, so naming the
// main checkout never names the worktrees nested in its .worktrees folder, and
// naming the home directory names nothing.
function findPathWord(path: string, words: readonly string[], home: string): string | null {
  const worktree = findWorktreeName(path);

  for (const word of words) {
    if (worktree !== null && word.split('/').includes(worktree)) {
      return word;
    }

    const named = resolveMessagePath(word, home);

    if (
      named !== null &&
      isUnder(path, named) &&
      !isUnder(home, named) &&
      findWorktreeName(named) === worktree
    ) {
      return word;
    }
  }

  return null;
}

function findWorktreeName(path: string): string | null {
  const matches = [...path.matchAll(/\/\.(?:claude\/)?worktrees\/(?<name>[^/]+)/gu)];

  return matches.at(-1)?.groups?.['name'] ?? null;
}

function resolveMessagePath(word: string, home: string): string | null {
  const expanded = word.startsWith('~/') ? join(home, word.slice(2)) : word;

  if (!expanded.startsWith('/')) {
    return null;
  }

  const path = normalize(expanded);

  return path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path;
}

function isUnder(path: string, root: string): boolean {
  return path === root || root === '/' || path.startsWith(`${root}/`);
}
