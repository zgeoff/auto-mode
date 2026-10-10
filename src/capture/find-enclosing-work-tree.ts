import { lstat, realpath } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';

export async function findEnclosingWorkTree(path: string): Promise<string | null> {
  const real = await resolveExistingPrefix(resolve(path));

  for (let directory = real; ; directory = dirname(directory)) {
    const enclosed = await hasGitEntry(directory);

    if (enclosed) {
      return directory;
    }

    if (dirname(directory) === directory) {
      return null;
    }
  }
}

async function resolveExistingPrefix(path: string): Promise<string> {
  const missing: string[] = [];

  for (let current = path; ; current = dirname(current)) {
    const real = await realpath(current).catch(() => null);

    if (real !== null) {
      return join(real, ...missing.toReversed());
    }

    if (dirname(current) === current) {
      return path;
    }

    missing.push(basename(current));
  }
}

const ABSENT_CODES = new Set(['ENOENT', 'ENOTDIR']);

async function hasGitEntry(directory: string): Promise<boolean> {
  try {
    await lstat(join(directory, '.git'));

    return true;
  } catch (error) {
    // An unreadable entry counts as present, so a refusal to write inside a
    // work tree fails safe.
    return !(error instanceof Error && 'code' in error && ABSENT_CODES.has(String(error.code)));
  }
}
