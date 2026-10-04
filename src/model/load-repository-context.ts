import { readFile, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import type { RepositoryContext } from './types.ts';

export async function loadRepositoryContext(cwd: string): Promise<RepositoryContext | null> {
  if (
    ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_COMMON_DIR'].some((name) => process.env[name] !== undefined)
  ) {
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

      if (parent === directory) {
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

    return { cwd: resolve(cwd), branch: parseReference(head, 'refs/heads/'), defaultBranch };
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
