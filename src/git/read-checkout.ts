import { readFile, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { HostEnvironment } from '../config/types.ts';
import { readGitEntry } from './read-git-entry.ts';
import type { Checkout } from './types.ts';

const GIT_OVERRIDES = ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_COMMON_DIR'];

export async function readCheckout(
  start: string,
  env: HostEnvironment['env'],
  stopDir?: string,
): Promise<Checkout | null> {
  if (GIT_OVERRIDES.some((name) => env[name] !== undefined)) {
    return null;
  }

  const entry = await readGitEntry(start, stopDir);

  const info = entry === null ? null : await stat(entry.gitPath).catch(() => null);

  if (entry === null || info === null) {
    return null;
  }

  const gitDir = info.isDirectory()
    ? entry.gitPath
    : await readLinkedGitDir(entry.directory, entry.gitPath);

  return gitDir === null
    ? null
    : { worktree: entry.directory, gitDir, commonDir: await readCommonDir(gitDir) };
}

async function readLinkedGitDir(directory: string, gitPath: string): Promise<string | null> {
  const link = await readFile(gitPath, 'utf8').catch(() => '');

  const path = /^gitdir: (?<path>.+)$/mu.exec(link)?.groups?.['path'];

  return path === undefined ? null : resolve(directory, path.trim());
}

async function readCommonDir(gitDir: string): Promise<string> {
  const common = await readFile(join(gitDir, 'commondir'), 'utf8').catch(() => null);

  return common === null ? gitDir : resolve(gitDir, common.trim());
}
