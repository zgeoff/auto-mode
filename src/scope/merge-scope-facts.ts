import type { ScopeFacts, ScopePullRequest } from './types.ts';

export function mergeScopeFacts(all: readonly ScopeFacts[]): ScopeFacts {
  const pullRequests = new Map<string, ScopePullRequest>();

  for (const pull of all.flatMap((facts) => facts.pullRequests)) {
    pullRequests.set(`${pull.repository}#${String(pull.number)}`, pull);
  }

  return {
    worktrees: [...new Set(all.flatMap((facts) => facts.worktrees))],
    branches: [...new Set(all.flatMap((facts) => facts.branches))],
    pullRequests: [...pullRequests.values()],
    pathGlobs: [...new Set(all.flatMap((facts) => facts.pathGlobs))],
  };
}
