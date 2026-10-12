import { realpath } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { findGitEntry } from '../git/find-git-entry.ts';

export async function findEnclosingWorkTree(path: string): Promise<string | null> {
  const real = await resolveExistingPrefix(resolve(path));
  const entry = await findGitEntry(real);

  return entry === null ? null : entry.directory;
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
