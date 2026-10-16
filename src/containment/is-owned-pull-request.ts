import { toRepositorySlug } from '../git/to-repository-slug.ts';
import type { OwnedScope } from '../scope/types.ts';

// `gh --repo` takes `owner/name` or `host/owner/name`; a bare `owner/name`
// matches on any host. Without a repository gh picks one of the checkout's
// remotes, so the PR counts only when every remote names its repository.
export function isOwnedPullRequest(
  number: number,
  repo: string | undefined,
  scope: Readonly<OwnedScope>,
): boolean {
  const wanted = repo?.toLowerCase().replace(/\.git$/u, '');

  const slugs = new Set(scope.remotes.map((remote) => toRepositorySlug(remote.url)));

  return scope.pullRequests.some(
    (pull) =>
      pull.number === number &&
      (wanted === undefined
        ? slugs.size === 1 && slugs.has(pull.repository)
        : pull.repository === wanted || pull.repository.endsWith(`/${wanted}`)),
  );
}
