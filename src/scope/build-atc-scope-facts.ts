import type { AtcSessionRecord } from './load-atc-session-record.ts';
import type { ScopeFacts } from './types.ts';

// A branch name means nothing outside its repository, so a branch counts only
// when the path atc names for it shares the action's git directory.
export function buildAtcScopeFacts(
  record: AtcSessionRecord,
  isInRepository: (path: string) => boolean,
): ScopeFacts {
  const scope = record.scope;
  const checkouts = [scope.workspace, ...scope.worktrees];

  return {
    worktrees: checkouts.map((checkout) => checkout.path),
    branches: [
      ...checkouts.flatMap((checkout) =>
        checkout.branch !== null && isInRepository(checkout.path) ? [checkout.branch] : [],
      ),
      ...scope.branches.flatMap((branch) =>
        isInRepository(branch.repo ?? scope.workspace.path) ? [branch.name] : [],
      ),
    ],
    pullRequests: scope.pullRequests.flatMap((pull) =>
      pull.branch === null
        ? []
        : [{ number: pull.number, head: pull.branch, repository: pull.repo }],
    ),
    pathGlobs: [],
  };
}
