import type { OwnedScope, ScopeRemote } from '../containment/collect-scope-findings.ts';
import { toRepositorySlug } from '../containment/to-repository-slug.ts';
import { mergeScopeFacts } from './merge-scope-facts.ts';
import type { ScopeFacts } from './types.ts';

export interface TaskScopeInput {
  readonly home: string;
  readonly currentBranch: string | null;
  readonly defaultBranch: string | null;
  readonly remotes: readonly ScopeRemote[];
  readonly facts: readonly ScopeFacts[];
}

// No source can hand a task the default branch, or a protected name when the
// default is unknown. A PR belongs to the task while its head branch does.
export function buildTaskScope(input: Readonly<TaskScopeInput>): OwnedScope {
  const merged = mergeScopeFacts(input.facts);

  const branches = merged.branches.filter(
    (branch) =>
      branch !== input.defaultBranch &&
      !(input.defaultBranch === null && DEFAULT_NAMES.has(branch)),
  );

  const repositories = new Set(input.remotes.map((remote) => toRepositorySlug(remote.url)));

  const pullRequests = merged.pullRequests
    .filter((pull) => branches.includes(pull.head) && repositories.has(pull.repository))
    .map((pull) => ({ number: pull.number, repository: pull.repository }));

  return {
    home: input.home,
    worktrees: merged.worktrees,
    branches,
    currentBranch: input.currentBranch,
    remotes: input.remotes,
    pullRequests,
    pathGlobs: merged.pathGlobs,
  };
}

const DEFAULT_NAMES: ReadonlySet<string> = new Set(['main', 'master', 'trunk', 'develop']);
