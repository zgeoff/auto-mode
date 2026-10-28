import type { HostEnvironment, OutputStream, TextFileReader } from '../config/types.ts';

export interface ScopePullRequest {
  readonly number: number;
  readonly head: string;
  readonly repository: string;
}

export interface ReplyChannel {
  readonly tool: string;
  readonly field: string;
  readonly recipient: string;
}

export interface ScopeFacts {
  readonly worktrees: readonly string[];
  readonly branches: readonly string[];
  readonly pullRequests: readonly ScopePullRequest[];
  readonly pathGlobs: readonly string[];
  readonly paths: readonly string[];
  readonly replyChannels: readonly ReplyChannel[];
}

export const EMPTY_SCOPE_FACTS: ScopeFacts = {
  worktrees: [],
  branches: [],
  pullRequests: [],
  pathGlobs: [],
  paths: [],
  replyChannels: [],
};

interface DeclaredCheckout {
  readonly path: string;
  readonly branch: string | null;
}

export interface DeclaredScope {
  readonly workspace?: DeclaredCheckout | undefined;
  readonly worktrees: readonly DeclaredCheckout[];
  readonly branches: readonly { readonly name: string; readonly repo?: string | undefined }[];
  readonly pullRequests: readonly {
    readonly repo: string;
    readonly number: number;
    readonly url?: string | undefined;
    readonly branch: string | null;
  }[];
}

export interface ScopeSourceContext {
  readonly env: HostEnvironment['env'];
  readonly sessionID: string;
  readonly cwd: string;
  readonly worktree: string;
  readonly commonDir: string | null;
  readonly branch: string | null;
  readonly stateDir: string;
  readonly atcRecordPath?: string | undefined;
  readonly atcSessionID?: string | undefined;
  readonly scopeFilePath?: string | undefined;
  readonly readTextFile: TextFileReader;
  readonly stderr: Readonly<OutputStream>;
}

export type ScopeSourceReader = (context: Readonly<ScopeSourceContext>) => Promise<ScopeFacts>;

export type ScopeEvent =
  | { readonly kind: 'worktree'; readonly path: string }
  | { readonly kind: 'branch'; readonly name: string; readonly directory: string }
  | { readonly kind: 'pull-request'; readonly directory: string; readonly head: string | null };

export interface SessionBranch {
  readonly name: string;
  readonly commonDir: string;
}

export interface SessionScope {
  readonly worktrees: readonly string[];
  readonly branches: readonly SessionBranch[];
  readonly pullRequests: readonly ScopePullRequest[];
}

export const EMPTY_SESSION_SCOPE: SessionScope = { worktrees: [], branches: [], pullRequests: [] };

export interface ScopeRemote {
  readonly name: string;
  readonly url: string;
}

interface OwnedPullRequest {
  readonly number: number;
  readonly repository: string;
}

export interface OwnedScope {
  readonly home: string;
  readonly worktrees: readonly string[];
  readonly branches: readonly string[];
  readonly currentBranch: string | null;
  readonly remotes: readonly ScopeRemote[];
  readonly pullRequests: readonly OwnedPullRequest[];
  readonly pathGlobs: readonly string[];
  readonly paths: readonly string[];
  readonly replyChannels: readonly ReplyChannel[];
}
