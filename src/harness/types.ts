export type Harness = 'claude' | 'codex' | 'muse';

export type HookEvent = 'PreToolUse' | 'PermissionRequest';

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

export interface HookPayload {
  readonly harness: Harness;
  readonly event: HookEvent;
  readonly sessionId: string;
  readonly cwd: string;
  readonly toolName: string;
  readonly toolInput: Readonly<Record<string, unknown>>;
  readonly transcriptPath?: string | undefined;
  readonly decisionContext?: DecisionContext | undefined;
  readonly raw: Readonly<Record<string, unknown>>;
}

export type Verdict =
  | { readonly kind: 'allow' }
  | { readonly kind: 'ask' }
  | { readonly kind: 'deny'; readonly rule: string; readonly reason: string };
