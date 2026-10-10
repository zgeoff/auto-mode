import type { MESSAGE_ORIGINS } from './message-origins.ts';

export type MessageOrigin = (typeof MESSAGE_ORIGINS)[number];

export interface UserTask {
  readonly text: string;
  readonly origin: MessageOrigin;
}

export interface DirectUserMessage extends UserTask {
  readonly freshness?: 'stale' | undefined;
}

export interface DelegatedTask {
  readonly text: string;
  readonly origin: 'agent.spawn';
}

export interface TaskOmission {
  readonly field: 'originalUserTask' | 'delegatedTask';
  readonly reason: 'unavailable' | 'budget';
}

export interface ModContext {
  readonly agentID: string | null;
  readonly originalUserTask: UserTask | null;
  readonly delegatedTask: DelegatedTask | null;
  readonly lastDirectUserMessage: DirectUserMessage | null;
  readonly omittedTaskContext: TaskOmission[];
}

export interface ModRequest {
  readonly sessionID: string;
  readonly toolUseID?: string | undefined;
  readonly cwd: string;
  readonly toolName: string;
  readonly toolInput: Readonly<Record<string, unknown>>;
  readonly context: ModContext;
}

export interface ModScopeRecord {
  readonly sessionID: string;
  readonly cwd: string;
  readonly startedAt: number;
  readonly command: string;
  readonly resultText: string;
}

export type ModVerdict =
  | { readonly decision: 'allow' }
  | { readonly decision: 'deny'; readonly reason: string };
