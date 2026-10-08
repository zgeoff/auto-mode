import { realpath } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';

// A link inside a worktree can point anywhere, so the bypass compares real
// paths: the deepest part of the target that exists, plus what is not there yet.
export async function resolveEditTarget(path: string): Promise<string> {
  const missing: string[] = [];

  for (let current = path; ; current = dirname(current)) {
    try {
      const real = await realpath(current);

      return join(real, ...missing.toReversed());
    } catch {
      if (dirname(current) === current) {
        return path;
      }

      missing.push(basename(current));
    }
  }
}
