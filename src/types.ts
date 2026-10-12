export type DecidingStage =
  | 'local'
  | 'containment'
  | 'bypass'
  | 'jev'
  | 'judge'
  | 'messages'
  | 'retry'
  | 'budget';

export interface DecisionRule {
  readonly name: string;
  readonly tier: 'hard' | 'soft';
  readonly source: 'shipped' | 'replacement' | 'configured';
  readonly text: string;
}

export type DenyBasis = 'matched' | 'unresolved';

export interface DeniedRule {
  readonly rule: DecisionRule;
  readonly basis: DenyBasis;
}

export interface TaskScopeSummary {
  readonly worktrees: readonly string[];
  readonly branches: readonly string[];
  readonly pullRequests: readonly { readonly repository: string; readonly number: number }[];
}

interface RepositoryRemote {
  readonly name: string;
  readonly url: string;
}

export interface RepositoryContext {
  readonly cwd: string;
  readonly branch: string | null;
  readonly defaultBranch: string | null;
  readonly remotes?: readonly RepositoryRemote[] | undefined;
  readonly taskScope?: TaskScopeSummary | undefined;
}

export interface MCPServerFact {
  readonly name: string;
  readonly scope: 'user' | 'local' | 'project';
  readonly transport: 'stdio' | 'http' | 'sse' | 'ws';
  readonly host: string | null;
}

export interface JudgeEvidence extends DeniedRule {
  readonly repositoryContext: RepositoryContext | null;
}
