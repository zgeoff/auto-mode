import type { Checkout } from '../src/scope/find-checkout.ts';

export interface StubCheckoutFinder {
  readonly findCheckout: (path: string) => Promise<Checkout | null>;
}

// Stands in for git's checkout lookup: a path is the worktree of its own
// checkout, whose git directory is the one listed for the path, or the
// fallback for a path not listed. With neither, the path is in no checkout.
export function buildStubCheckoutFinder(
  commonDirs: Readonly<Record<string, string>>,
  fallback: string | null = null,
): StubCheckoutFinder {
  return {
    findCheckout: (path) => {
      const commonDir = commonDirs[path] ?? fallback;
      const checkout = commonDir === null ? null : { worktree: path, commonDir };

      return Promise.resolve(checkout);
    },
  };
}
