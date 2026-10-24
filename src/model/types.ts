import type { ClaudeRules, EvaluationOptions } from '../config/types.ts';
import type { CheckoutFacts, CheckoutReader } from '../git/types.ts';
import type { DecisionContext, Verdict } from '../request/types.ts';
import type { DecisionRule, JudgeEvidence, MCPServerFact, RepositoryContext } from '../types.ts';

export interface ModelOutcome {
  readonly verdict: Verdict | null;
  readonly note: string;
  readonly unavailable?: boolean;
  readonly diagnostics?: DecisionDiagnostics;
  readonly review?: JudgeEvidence;
}

export interface ModelOptions extends EvaluationOptions {
  readonly checkout?: CheckoutFacts | undefined;
  readonly readCheckout?: CheckoutReader | undefined;
}

export type DecisionChoice = 'allow' | 'block';

// The recorded evaluation reports hold ask answers.
export type RecordedDecisionChoice = DecisionChoice | 'ask';

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

export interface DecisionAnswer<Choice extends string = DecisionChoice> {
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
  readonly blockThreshold: number;
  readonly contributors: readonly {
    readonly rule: string;
    readonly source: DecisionRule['source'];
    readonly tier: DecisionRule['tier'];
    readonly choice: DecisionAnswer['choice'];
    readonly confidence: number;
    readonly blockProbability: number;
  }[];
}
