import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

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

  // The first line of a branch's reflog records its creation: the old object
  // is all zeros.
  const [first = ''] = log.split('\n');
  const seconds = /^0+ [\da-f]+ .* (?<time>\d+) [+-]\d{4}\t/u.exec(first)?.groups?.['time'];

  return seconds === undefined ? null : Number(seconds) * 1000;
}
