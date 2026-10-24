import { lstat, realpath } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';

// A link inside a worktree can point anywhere, so a target is compared by its
// real path.
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
