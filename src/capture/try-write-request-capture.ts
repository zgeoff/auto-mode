import { constants } from 'node:fs';
import { chmod, mkdir, open, realpath, stat } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import type { DecidingStage } from '../classify-action.ts';
import type { Verdict } from '../request/types.ts';
import { findEnclosingWorkTree } from './find-enclosing-work-tree.ts';

export interface CaptureRecord {
  readonly schemaVersion: 1;
  readonly time: string;
  readonly request: unknown;
  readonly verdict: Verdict | null;
  readonly decidingStage: DecidingStage | 'budget';
  readonly escalation: boolean;
}

export type CaptureOutcome =
  | { readonly kind: 'written'; readonly path: string }
  | { readonly kind: 'refused'; readonly reason: string }
  | { readonly kind: 'failed' };

export async function tryWriteRequestCapture(
  dir: string,
  record: Readonly<CaptureRecord>,
): Promise<CaptureOutcome> {
  if (!isAbsolute(dir)) {
    return { kind: 'refused', reason: `the capture dir ${dir} is not an absolute path` };
  }

  try {
    const before = await findEnclosingWorkTree(dir);

    if (before !== null) {
      return { kind: 'refused', reason: `the capture dir is inside the git work tree ${before}` };
    }

    await mkdir(dir, { recursive: true, mode: 0o700 });

    const real = await realpath(dir);

    // A link created after the first check could point the dir into a work
    // tree, so the resolved dir is checked again before the write.
    const after = await findEnclosingWorkTree(real);

    if (after !== null) {
      return { kind: 'refused', reason: `the capture dir is inside the git work tree ${after}` };
    }

    const info = await stat(real);

    if ((info.mode & 0o077) !== 0) {
      await chmod(real, 0o700);
    }

    // A bare repository whose work tree is the home directory has no `.git`
    // on the walk, but git honours this file in any work tree.
    await writeOwnerFile(join(real, '.gitignore'), '*\n', constants.O_TRUNC);

    const path = join(real, `requests-${record.time.slice(0, 10)}.jsonl`);

    await writeOwnerFile(path, `${JSON.stringify(record)}\n`, constants.O_APPEND);

    return { kind: 'written', path };
  } catch {
    return { kind: 'failed' };
  }
}

// O_NOFOLLOW makes a link planted at the path fail the write instead of
// redirecting it.
async function writeOwnerFile(path: string, text: string, flag: number): Promise<void> {
  const handle = await open(
    path,
    constants.O_WRONLY | constants.O_CREAT | constants.O_NOFOLLOW | flag,
    0o600,
  );

  try {
    const info = await handle.stat();

    if ((info.mode & 0o077) !== 0) {
      await handle.chmod(0o600);
    }

    await handle.writeFile(text);
  } finally {
    await handle.close();
  }
}
