import { toRepositorySlug } from '../git/to-repository-slug.ts';
import { isProtectedBranch } from './is-protected-branch.ts';
import { mergeScopeFacts } from './merge-scope-facts.ts';
import { PROTECTED_BRANCH_NAMES } from './protected-branch-names.ts';
import type { OwnedScope, ScopeFacts, ScopeRemote } from './types.ts';

export interface TaskScopeInput {
  readonly home: string;
  readonly currentBranch: string | null;
  readonly defaultBranch: string | null;
  readonly protectedBranches?: readonly string[] | undefined;
  readonly remotes: readonly ScopeRemote[];
  readonly facts: readonly ScopeFacts[];
}

export function buildTaskScope(input: Readonly<TaskScopeInput>): OwnedScope {
  const merged = mergeScopeFacts(input.facts);

  const branches = merged.branches.filter(
    (branch) =>
      branch !== input.defaultBranch &&
      !(input.defaultBranch === null && PROTECTED_BRANCH_NAMES.has(branch)) &&
      !isProtectedBranch(branch, input.protectedBranches ?? []),
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
    paths: merged.paths,
    replyChannels: merged.replyChannels,
  };
}
