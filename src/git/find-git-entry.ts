import { lstat } from 'node:fs/promises';
import { dirname, join, parse } from 'node:path';

// The one walk up to the nearest `.git`: the directory that holds the entry,
// and the entry's path. The walk stops after the stop directory.
export async function findGitEntry(
  start: string,
  stopDir: string = parse(start).root,
): Promise<{ readonly directory: string; readonly gitPath: string } | null> {
  for (let directory = start; ; directory = dirname(directory)) {
    const gitPath = join(directory, '.git');

    const isPresent = await hasEntry(gitPath);

    if (isPresent) {
      return { directory, gitPath };
    }

    if (dirname(directory) === directory || directory === stopDir) {
      return null;
    }
  }
}

const ABSENT_CODES = new Set(['ENOENT', 'ENOTDIR']);

// An entry that exists but cannot be read counts as present, so the walk
// never passes a checkout it cannot read to reach the one above it.
async function hasEntry(path: string): Promise<boolean> {
  try {
    await lstat(path);

    return true;
  } catch (error) {
    return !(error instanceof Error && 'code' in error && ABSENT_CODES.has(String(error.code)));
  }
}
