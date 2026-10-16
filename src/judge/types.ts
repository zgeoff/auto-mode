import type { ModelRequest } from '../messages/anthropic-client.ts';

export type OverturnBasis = 'consent' | 'misread';

export type JudgeReply =
  | { readonly kind: 'confirm'; readonly reason: string }
  | { readonly kind: 'overturn'; readonly basis: OverturnBasis; readonly reason: string }
  | { readonly kind: 'unreadable' };

// Which overturns of a soft rule allow the action: only those the last direct
// user message consents to, or misreads of the rule as well.
export type JudgeOverturns = 'consent' | 'any';

export type JudgeStatus = 'confirmed' | 'overturned' | 'held' | 'failed';

// The model is the one that wrote the reply, which a safety fallback makes
// another model than the configured one. `warm` holds whether a judge process
// an earlier review started answered this one; null for a Messages API judge.
export interface JudgeMessageReply {
  readonly text: string;
  readonly model: string;
  readonly safetyStops: number | null;
  readonly fallback: boolean;
  readonly warm: boolean | null;
}

// A judge session reviews one request at a time and keeps its process between
// reviews; the CLI reaches one through the judge server, a library caller holds
// one in process.
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
  readonly model: string;

  // The model that wrote the reply, which a safety fallback makes differ from
  // the configured one; null when no reply came back.
  readonly answeringModel: string | null;
  readonly safetyStops: number | null;
  readonly warm: boolean | null;
  readonly rule: string;
  readonly tier: 'hard' | 'soft';
  readonly elapsedMs: number;
}
