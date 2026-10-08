import { toRepositorySlug } from '../containment/to-repository-slug.ts';
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
    pullRequests: scope.pullRequests.flatMap((pull) => {
      const repository = toRepositorySlug(`https://${findHost(pull.url)}/${pull.repo}`);

      return pull.branch === null || repository === null
        ? []
        : [{ number: pull.number, head: pull.branch, repository }];
    }),
    pathGlobs: [],
  };
}

// atc checks a declared PR through gh, whose default host is GitHub; the PR's
// URL, when the record holds one, names the host it actually lives on.
function findHost(url: string | undefined): string {
  return (url === undefined ? null : URL.parse(url)?.host) ?? 'github.com';
}
