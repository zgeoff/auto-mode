import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

// The first line of a branch's reflog records its creation: the old object
// is all zeros. Returns that time in milliseconds, or null when the reflog is
// missing or starts with an update of a branch that already existed.
export async function readBranchCreatedAt(
  commonDir: string,
  branch: string,
): Promise<number | null> {
  if (!/^[\w./-]+$/u.test(branch) || branch.split('/').includes('..')) {
    return null;
  }

  const log = await readFile(join(commonDir, 'logs', 'refs', 'heads', branch), 'utf8').catch(
    () => '',
  );

  const [first = ''] = log.split('\n');
  const seconds = /^0+ [\da-f]+ .* (?<time>\d+) [+-]\d{4}\t/u.exec(first)?.groups?.['time'];

  return seconds === undefined ? null : Number(seconds) * 1000;
}
