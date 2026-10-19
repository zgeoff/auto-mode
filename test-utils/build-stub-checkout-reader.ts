import type { Checkout } from '../src/git/types.ts';

export interface StubCheckoutReader {
  readonly readCheckout: (path: string) => Promise<Checkout | null>;
}

// Stands in for git's checkout lookup: a path is the worktree of its own
// checkout, whose git directory is the one listed for the path, or the
// fallback for a path not listed. With neither, the path is in no checkout.
export function buildStubCheckoutReader(
  commonDirs: Readonly<Record<string, string>>,
  fallback: string | null = null,
): StubCheckoutReader {
  return {
    readCheckout: (path) => {
      const commonDir = commonDirs[path] ?? fallback;
      const checkout = commonDir === null ? null : { worktree: path, gitDir: commonDir, commonDir };

      return Promise.resolve(checkout);
    },
  };
}
