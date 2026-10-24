import { lstat } from 'node:fs/promises';
import { dirname, join, parse } from 'node:path';

export async function readGitEntry(
  start: string,
  stopDir: string = parse(start).root,
): Promise<{ readonly directory: string; readonly gitPath: string } | null> {
  for (let directory = start; ; directory = dirname(directory)) {
    const gitPath = join(directory, '.git');

    const isPresent = await probeEntry(gitPath);

    if (isPresent) {
      return { directory, gitPath };
    }

    if (dirname(directory) === directory || directory === stopDir) {
      return null;
    }
  }
}

const ABSENT_CODES = new Set(['ENOENT', 'ENOTDIR']);

async function probeEntry(path: string): Promise<boolean> {
  try {
    await lstat(path);

    return true;
  } catch (error) {
    return !(error instanceof Error && 'code' in error && ABSENT_CODES.has(String(error.code)));
  }
}
