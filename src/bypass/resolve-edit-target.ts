import { lstat, realpath } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';

// A link inside a worktree can point anywhere, so the bypass compares real
// paths: the deepest part of the target that exists, plus what is not there
// yet. A part that exists but does not resolve, such as a dangling link, is null.
export async function resolveEditTarget(path: string): Promise<string | null> {
  const missing: string[] = [];

  for (let current = path; ; current = dirname(current)) {
    try {
      const real = await realpath(current);

      return join(real, ...missing.toReversed());
    } catch {
      const entry = await lstat(current).catch(() => null);

      if (entry !== null || dirname(current) === current) {
        return null;
      }

      missing.push(basename(current));
    }
  }
}
