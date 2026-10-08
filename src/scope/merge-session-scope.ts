import type { ScopePullRequest, SessionBranch, SessionScope } from './types.ts';

export function mergeSessionScope(all: readonly SessionScope[]): SessionScope {
  const branches = new Map<string, SessionBranch>();
  const pullRequests = new Map<string, ScopePullRequest>();

  for (const branch of all.flatMap((scope) => scope.branches)) {
    branches.set(`${branch.commonDir}\0${branch.name}`, branch);
  }

  for (const pull of all.flatMap((scope) => scope.pullRequests)) {
    pullRequests.set(`${pull.repository}#${String(pull.number)}`, pull);
  }

  return {
    worktrees: [...new Set(all.flatMap((scope) => scope.worktrees))],
    branches: [...branches.values()],
    pullRequests: [...pullRequests.values()],
  };
}
