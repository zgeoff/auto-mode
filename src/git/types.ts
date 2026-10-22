import type { HostEnvironment } from '../config/types.ts';
import type { ScopeRemote } from '../scope/types.ts';

export interface Checkout {
  readonly worktree: string;
  readonly gitDir: string;
  readonly commonDir: string;
}

// The hooks folder each git config layer sets, or null when it sets none.
export interface ConfigLayerHooks {
  readonly system: string | null;
  readonly global: string | null;
  readonly repository: string | null;
}

// Where a checkout's hooks run from: the folder git runs them from, the folder
// it runs them from when no config sets one, and the config lefthook loads, or
// null when the worktree root holds none.
export interface HookFacts {
  readonly worktree: string;
  readonly hooksDirectory: string;
  readonly defaultHooksDirectory: string;
  readonly lefthookConfig: string | null;
  readonly layerHooks: ConfigLayerHooks;

  // Each GIT_CONFIG_GLOBAL or GIT_CONFIG_SYSTEM file the action names, by its
  // resolved path, to the hooks folder it sets. An unjudged file has no entry.
  readonly configFileHooks: Readonly<Record<string, string | null>>;
}

// The file reads the hook reader makes. A missing file reads as null and
// probes as false; any other failure rejects.
export interface HookFactsFiles {
  readonly readText: (path: string) => Promise<string | null>;
  readonly probeFile: (path: string) => Promise<boolean>;
}

export type CheckoutReader = (
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
