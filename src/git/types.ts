import type { HostEnvironment } from '../config/types.ts';
import type { ScopeRemote } from '../scope/types.ts';

export interface Checkout {
  readonly worktree: string;
  readonly gitDir: string;
  readonly commonDir: string;
}

interface ConfigLayerHooks {
  readonly system: string | null;
  readonly global: string | null;
  readonly repository: string | null;
}

export interface HookFacts {
  readonly worktree: string;
  readonly hooksDirectory: string;
  readonly defaultHooksDirectory: string;
  readonly lefthookConfig: string | null;
  readonly layerHooks: ConfigLayerHooks;

  readonly configFileHooks: Readonly<Record<string, string | null>>;
}

export interface HookFactsFiles {
  readonly readText: (path: string, maxBytes: number) => Promise<string | null>;
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

export interface CheckoutFacts {
  readonly cwd: string;
  readonly checkout: Checkout | null;
  readonly head: CheckoutHead | null;
  readonly remotes: readonly ScopeRemote[];
}
