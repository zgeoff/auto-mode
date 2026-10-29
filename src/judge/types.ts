import type { ModelRequest } from '../messages/anthropic-client.ts';

export type OverturnBasis = 'consent' | 'misread';

export type JudgeReply =
  | { readonly kind: 'confirm'; readonly reason: string }
  | { readonly kind: 'overturn'; readonly basis: OverturnBasis; readonly reason: string }
  | { readonly kind: 'unreadable' };

export type JudgeOverturns = 'consent' | 'any';

export type JudgeStatus = 'confirmed' | 'overturned' | 'held' | 'failed';

export interface JudgeMessageReply {
  readonly text: string;
  readonly model: string;
  readonly safetyStops: number | null;
  readonly fallback: boolean;
  readonly warm: boolean | null;
  readonly modelUsage: Readonly<Record<string, unknown>> | null;
}

export interface JudgeUsage {
  readonly model: string;
  readonly answeringModel: string;
  readonly modelUsage: Readonly<Record<string, unknown>>;
}

export interface JudgeSession {
  readonly review: (
    model: string,
    request: Readonly<ModelRequest>,
    signal: Readonly<AbortSignal>,
  ) => Promise<JudgeMessageReply>;
  readonly stop: () => void;
}

export type JudgeFailure = 'credential' | 'policy' | 'request' | 'timeout' | 'unreadable';

export interface JudgeDiagnostics {
  readonly status: JudgeStatus;
  readonly failureReason: JudgeFailure | null;
  readonly overturnBasis: OverturnBasis | null;
  readonly overturnReason: string | null;
  readonly model: string;

  // A safety fallback can answer on another model than the configured one.
  readonly answeringModel: string | null;
  readonly safetyStops: number | null;
  readonly warm: boolean | null;
  readonly rule: string;
  readonly tier: 'hard' | 'soft';
  readonly elapsedMs: number;
}
