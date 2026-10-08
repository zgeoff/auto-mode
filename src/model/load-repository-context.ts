import { readFile, stat } from 'node:fs/promises';
import { dirname, join, parse, resolve } from 'node:path';
import type { HostEnvironment } from '../config/types.ts';
import { loadCheckoutRemotes } from '../scope/load-checkout-remotes.ts';
import type { RepositoryContext } from './types.ts';

export async function loadRepositoryContext(
  cwd: string,
  env: HostEnvironment['env'],
  stopDir: string = parse(resolve(cwd)).root,
): Promise<RepositoryContext | null> {
  if (['GIT_DIR', 'GIT_WORK_TREE', 'GIT_COMMON_DIR'].some((name) => env[name] !== undefined)) {
    return null;
  }

  let directory = resolve(cwd);

  for (;;) {
    const gitPath = join(directory, '.git');

    try {
      await stat(gitPath);
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) {
        return null;
      }

      const parent = dirname(directory);

      if (parent === directory || directory === resolve(stopDir)) {
        return null;
      }

      directory = parent;
      continue;
    }

    let gitDir = gitPath;
    let head: string;

    try {
      try {
        head = await readFile(join(gitDir, 'HEAD'), 'utf8');
      } catch {
        const link = await readFile(gitPath, 'utf8');

        const match = /^gitdir: (?<path>.+)\r?\n?$/u.exec(link);
        const path = match?.groups?.['path'];

        if (path === undefined) {
          return null;
        }

        gitDir = resolve(directory, path.trim());

        head = await readFile(join(gitDir, 'HEAD'), 'utf8');
      }
    } catch {
      return null;
    }

    let commonDir = gitDir;

    try {
      const common = await readFile(join(gitDir, 'commondir'), 'utf8');

      commonDir = resolve(gitDir, common.trim());
    } catch {
      commonDir = gitDir;
    }

    let defaultBranch: string | null = null;

    try {
      const originHead = await readFile(
        join(commonDir, 'refs', 'remotes', 'origin', 'HEAD'),
        'utf8',
      );

      defaultBranch = parseReference(originHead, 'refs/remotes/origin/');
    } catch {
      defaultBranch = null;
    }

    const remotes = await loadCheckoutRemotes(commonDir);

    return {
      cwd: resolve(cwd),
      branch: parseReference(head, 'refs/heads/'),
      defaultBranch,
      remotes: remotes.flatMap((remote) => {
        const url = normalizeRemoteURL(remote.url);

        return url === null ? [] : [{ name: remote.name, url }];
      }),
    };
  }
}

function parseReference(content: string, prefix: string): string | null {
  const value = content.trim();
  const marker = `ref: ${prefix}`;

  if (!value.startsWith(marker)) {
    return null;
  }

  const branch = value.slice(marker.length);

  return branch !== '' && branch.length <= 256 && !/\s/u.test(branch) ? branch : null;
}

// A remote URL can hold a token as its user info, and the request leaves the
// machine, so only the host and path go into it; a URL that does not parse is
// left out rather than sent with what it might hold.
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
