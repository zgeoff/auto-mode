import type { Checkout } from '../src/git/types.ts';

export interface StubCheckoutReader {
  readonly readCheckout: (path: string) => Promise<Checkout | null>;
}

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
