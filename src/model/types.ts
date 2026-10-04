import type { ClaudeRules } from '../config/load-claude-rules.ts';

export interface DecisionRule {
  readonly name: string;
  readonly tier: 'hard' | 'soft';
  readonly source: 'shipped' | 'replacement' | 'configured';
  readonly text: string;
}

export interface DecisionRequest {
  readonly state: {
    readonly policy: string;
    readonly rulesSource: 'shipped' | 'replacement';
    readonly configuredRules: ClaudeRules;
    readonly lastUserMessage: string | null;
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
}
