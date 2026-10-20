export type DecidingStage =
  | 'local'
  | 'containment'
  | 'bypass'
  | 'jev'
  | 'judge'
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

// A hard rule that Jev chose to allow, with a low block probability and no
// other rule blocking, is the one hard deny a misread overturn clears.
export interface ReviewedRule extends DeniedRule {
  readonly misreadClears: boolean;
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

// A containment finding and the word of the last direct user message that
// names its target.
export interface NamedTarget {
  readonly kind: string;
  readonly target: string;
  readonly namedAs: string;
}

// A containment deny the user named every target of, which the judge reviews
// in place of a Jev deny; a review that does not overturn keeps its reason.
export interface ContainmentEvidence {
  readonly reason: string;
  readonly targets: readonly NamedTarget[];
}

export interface JudgeEvidence extends DeniedRule {
  readonly misreadClears?: boolean | undefined;
  readonly repositoryContext: RepositoryContext | null;
  readonly containment?: ContainmentEvidence | undefined;
}
