interface UserTask {
  readonly text: string;
  readonly origin: 'composer' | 'bridge' | 'sdk';
}

export interface DecisionContext {
  readonly agentID: string | null;
  readonly originalUserTask: UserTask | null;
  readonly delegatedTask: { readonly text: string; readonly origin: 'agent.spawn' } | null;
  readonly lastDirectUserMessage: UserTask | null;
  readonly omittedTaskContext: readonly {
    readonly field: 'originalUserTask' | 'delegatedTask';
    readonly reason: 'unavailable' | 'budget';
  }[];
}

export interface ActionRequest {
  readonly sessionID: string;
  readonly toolUseID?: string | undefined;
  readonly cwd: string;
  readonly toolName: string;
  readonly toolInput: Readonly<Record<string, unknown>>;
  readonly decisionContext?: DecisionContext | undefined;
}

export type Verdict =
  | { readonly kind: 'allow' }
  | { readonly kind: 'deny'; readonly rule: string; readonly reason: string };
