import { toRepositorySlug } from '../git/to-repository-slug.ts';
import type { DeclaredScope, ScopeFacts } from './types.ts';
import { EMPTY_SCOPE_FACTS } from './types.ts';

export function buildDeclaredScopeFacts(
  scope: Readonly<DeclaredScope>,
  isInRepository: (path: string) => boolean,
): ScopeFacts {
  const checkouts =
    scope.workspace === undefined ? scope.worktrees : [scope.workspace, ...scope.worktrees];

  return {
    ...EMPTY_SCOPE_FACTS,
    worktrees: checkouts.map((checkout) => checkout.path),
    branches: [
      ...checkouts.flatMap((checkout) =>
        checkout.branch !== null && isInRepository(checkout.path) ? [checkout.branch] : [],
      ),
      ...scope.branches.flatMap((branch) => {
        const repo = branch.repo ?? scope.workspace?.path;

        return repo !== undefined && isInRepository(repo) ? [branch.name] : [];
      }),
    ],
    pullRequests: scope.pullRequests.flatMap((pull) => {
      const repository = toRepositorySlug(`https://${getHost(pull.url)}/${pull.repo}`);

      return pull.branch === null || repository === null
        ? []
        : [{ number: pull.number, head: pull.branch, repository }];
    }),
  };
}

// gh, which launchers use to check a declared PR, defaults to GitHub; the PR's
// URL, when the scope holds one, names the host it actually lives on.
function getHost(url: string | undefined): string {
  return (url === undefined ? null : URL.parse(url)?.host) ?? 'github.com';
}
