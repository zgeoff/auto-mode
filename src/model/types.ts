import type { ClaudeRules } from '../config/types.ts';
import type { DecisionContext } from '../request/types.ts';

export interface DecisionRule {
  readonly name: string;
  readonly tier: 'hard' | 'soft';
  readonly source: 'shipped' | 'replacement' | 'configured';
  readonly text: string;
}

export type DecisionChoice = 'allow' | 'block' | 'ask';

interface DecisionQuestion<Choice extends string = DecisionChoice> {
  readonly type: 'choice';
  readonly instructions: string;
  readonly criteria: Readonly<Record<Choice, string>>;
}

export interface DecisionInput<Choice extends string = DecisionChoice> {
  readonly state: {
    readonly policy: string;
    readonly answerGuidance: string;
    readonly rulesSource: 'shipped' | 'replacement';
    readonly configuredRules: ClaudeRules;
    readonly lastUserMessage: string | null;
    readonly repositoryContext?: RepositoryContext;
    readonly mcpServers?: readonly MCPServerFact[];
    readonly taskContext?: DecisionContext;
    readonly action: {
      readonly tool: string;
      readonly cwd: string;
      readonly input: Readonly<Record<string, unknown>>;
    };
  };
  readonly questions: Readonly<Record<string, DecisionQuestion<Choice>>>;
}

export interface DecisionRequest extends DecisionInput {
  readonly rules: Readonly<Record<string, DecisionRule>>;
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

interface RepositoryRemote {
  readonly name: string;
  readonly url: string;
}

export interface TaskScopeSummary {
  readonly worktrees: readonly string[];
  readonly branches: readonly string[];
  readonly pullRequests: readonly { readonly repository: string; readonly number: number }[];
}

interface DecisionAnswer<Choice extends string = DecisionChoice> {
  readonly type: 'choice';
  readonly choice: Choice;
  readonly probabilities: Readonly<Record<Choice, number>>;
  readonly confidence: number;
}

export interface DecisionResult<Choice extends string = DecisionChoice> {
  readonly model: string;
  readonly answers: Readonly<Record<string, DecisionAnswer<Choice>>>;
  readonly inputTokens: number;
  readonly requestBytes: number;
}

export type DecisionFailureReason =
  | 'request-too-large'
  | 'aborted'
  | 'network'
  | 'http-status'
  | 'invalid-response';

export interface DecisionDiagnostics {
  readonly status: 'allow' | 'deny' | 'failure' | 'timeout' | 'cancelled';
  readonly stage: 'credential' | 'evidence' | 'request' | 'response';
  readonly keyResolved: boolean;
  readonly keySource: 'environment' | 'command' | 'none';
  readonly failureReason: DecisionFailureReason | null;
  readonly requestBytes: number | null;
  readonly elapsedMs: number;
  readonly minConfidence: number;
  readonly contributors: readonly {
    readonly rule: string;
    readonly source: DecisionRule['source'];
    readonly tier: DecisionRule['tier'];
    readonly choice: DecisionAnswer['choice'];
    readonly confidence: number;
    readonly probability: number;
  }[];
}
