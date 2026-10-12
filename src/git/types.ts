import type { HostEnvironment } from '../config/types.ts';
import type { ScopeRemote } from '../scope/types.ts';

export interface Checkout {
  readonly worktree: string;
  readonly gitDir: string;
  readonly commonDir: string;
}

export type CheckoutFinder = (
  start: string,
  env: HostEnvironment['env'],
) => Promise<Checkout | null>;

interface CheckoutHead {
  readonly branch: string | null;
  readonly defaultBranch: string | null;
}

// What one walk from the action's cwd reads. `head` is null outside a checkout
// and when the checkout's HEAD cannot be read.
export interface CheckoutFacts {
  readonly cwd: string;
  readonly checkout: Checkout | null;
  readonly head: CheckoutHead | null;
  readonly remotes: readonly ScopeRemote[];
}
