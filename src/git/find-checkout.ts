import { readFile, stat } from 'node:fs/promises';
import { dirname, join, parse, resolve } from 'node:path';
import type { HostEnvironment } from '../config/types.ts';

export interface Checkout {
  readonly worktree: string;
  readonly commonDir: string;
}

const GIT_OVERRIDES = ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_COMMON_DIR'];

export async function findCheckout(
  start: string,
  env: HostEnvironment['env'],
  stopDir: string = parse(start).root,
): Promise<Checkout | null> {
  if (GIT_OVERRIDES.some((name) => env[name] !== undefined)) {
    return null;
  }

  for (let directory = start; ; directory = dirname(directory)) {
    const gitPath = join(directory, '.git');

    const info = await stat(gitPath).catch(() => null);

    if (info !== null) {
      const gitDir = info.isDirectory() ? gitPath : await findLinkedGitDir(directory, gitPath);

      return gitDir === null
        ? null
        : { worktree: directory, commonDir: await findCommonDir(gitDir) };
    }

    if (dirname(directory) === directory || directory === stopDir) {
      return null;
    }
  }
}

async function findLinkedGitDir(directory: string, gitPath: string): Promise<string | null> {
  const link = await readFile(gitPath, 'utf8').catch(() => '');

  const path = /^gitdir: (?<path>.+)$/mu.exec(link)?.groups?.['path'];

  return path === undefined ? null : resolve(directory, path.trim());
}

async function findCommonDir(gitDir: string): Promise<string> {
  const common = await readFile(join(gitDir, 'commondir'), 'utf8').catch(() => null);

  return common === null ? gitDir : resolve(gitDir, common.trim());
}
