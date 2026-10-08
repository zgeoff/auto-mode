export interface ScopePullRequest {
  readonly number: number;
  readonly head: string;
  readonly repository: string;
}

export interface ScopeFacts {
  readonly worktrees: readonly string[];
  readonly branches: readonly string[];
  readonly pullRequests: readonly ScopePullRequest[];
  readonly pathGlobs: readonly string[];
}

export const EMPTY_SCOPE_FACTS: ScopeFacts = {
  worktrees: [],
  branches: [],
  pullRequests: [],
  pathGlobs: [],
};

interface ScopeSourceContext {
  readonly sessionID: string;
  readonly cwd: string;
  readonly worktree: string;
  readonly branch: string | null;
  readonly stateDir: string;
}

export type ScopeSourceReader = (context: Readonly<ScopeSourceContext>) => Promise<ScopeFacts>;

export type ScopeEvent =
  | { readonly kind: 'worktree'; readonly path: string }
  | { readonly kind: 'branch'; readonly name: string; readonly directory: string }
  | { readonly kind: 'pull-request'; readonly directory: string; readonly head: string | null };
