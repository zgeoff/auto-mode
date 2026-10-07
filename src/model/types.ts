import type { ClaudeRules } from '../config/load-claude-rules.ts';
import type { DecisionContext } from '../request/types.ts';

export interface DecisionRule {
  readonly name: string;
  readonly tier: 'hard' | 'soft';
  readonly source: 'shipped' | 'replacement' | 'configured';
  readonly text: string;
}

export interface DecisionRequest {
  readonly state: {
    readonly policy: string;
    readonly answerGuidance: string;
    readonly rulesSource: 'shipped' | 'replacement';
    readonly configuredRules: ClaudeRules;
    readonly lastUserMessage: string | null;
    readonly repositoryContext?: RepositoryContext;
    readonly taskContext?: DecisionContext;
    readonly action: {
      readonly tool: string;
      readonly cwd: string;
      readonly input: Readonly<Record<string, unknown>>;
    };
  };
  readonly questions: Readonly<
    Record<
      string,
      {
        readonly type: 'choice';
        readonly instructions: string;
        readonly criteria: Readonly<Record<'allow' | 'block' | 'ask', string>>;
      }
    >
  >;
  readonly rules: Readonly<Record<string, DecisionRule>>;
}

export interface RepositoryContext {
  readonly cwd: string;
  readonly branch: string | null;
  readonly defaultBranch: string | null;
}

interface DecisionAnswer {
  readonly type: 'choice';
  readonly choice: 'allow' | 'block' | 'ask';
  readonly probabilities: Readonly<Record<'allow' | 'block' | 'ask', number>>;
  readonly confidence: number;
}

export interface DecisionResult {
  readonly model: string;
  readonly answers: Readonly<Record<string, DecisionAnswer>>;
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
  readonly status: 'allow' | 'deny' | 'ask' | 'failure' | 'timeout' | 'cancelled';
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
