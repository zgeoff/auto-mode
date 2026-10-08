import type { OwnedScope, ScopeRemote } from './collect-scope-findings.ts';

export interface CWDScopeInput {
  readonly home: string;
  readonly worktree: string;
  readonly branch: string | null;
  readonly defaultBranch: string | null;
  readonly remotes: readonly ScopeRemote[];
}

// The task owns the worktree that holds the action's cwd, and its branch unless
// that is the default branch, which is never one task's own. A checkout whose
// default branch is unknown owns no branch named main or master either.
export function buildCWDScope(input: Readonly<CWDScopeInput>): OwnedScope {
  const isDefault =
    input.branch === input.defaultBranch ||
    (input.defaultBranch === null && DEFAULT_NAMES.has(input.branch ?? ''));

  return {
    home: input.home,
    worktrees: [input.worktree],
    branches: input.branch !== null && !isDefault ? [input.branch] : [],
    currentBranch: input.branch,
    remotes: input.remotes,
    pullRequests: [],
  };
}

const DEFAULT_NAMES: ReadonlySet<string> = new Set(['main', 'master', 'trunk', 'develop']);
