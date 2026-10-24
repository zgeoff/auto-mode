import type { RepositoryContext } from '../types.ts';
import type { CheckoutFacts } from './types.ts';

export function buildRepositoryContext(facts: Readonly<CheckoutFacts>): RepositoryContext | null {
  if (facts.head === null) {
    return null;
  }

  return {
    cwd: facts.cwd,
    branch: facts.head.branch,
    defaultBranch: facts.head.defaultBranch,
    remotes: facts.remotes.flatMap((remote) => {
      const url = normalizeRemoteURL(remote.url);

      return url === null ? [] : [{ name: remote.name, url }];
    }),
  };
}

// A remote URL can hold a token as its user info.
function normalizeRemoteURL(url: string): string | null {
  if (/^[a-z][a-z0-9+.-]*:\/\//iu.test(url)) {
    const parsed = URL.parse(url);

    if (parsed === null) {
      return null;
    }

    parsed.username = '';
    parsed.password = '';
    parsed.search = '';
    parsed.hash = '';

    return parsed.href;
  }

  // In the scp form `user@host:path` the user part can itself be a token.
  const slash = url.indexOf('/');
  const end = slash === -1 ? url.length : slash;
  const at = url.lastIndexOf('@', end);

  return at === -1 ? url : url.slice(at + 1);
}
