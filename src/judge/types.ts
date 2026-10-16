export type OverturnBasis = 'consent' | 'misread';

export type JudgeReply =
  | { readonly kind: 'confirm'; readonly reason: string }
  | { readonly kind: 'overturn'; readonly basis: OverturnBasis; readonly reason: string }
  | { readonly kind: 'unreadable' };

// Which overturns of a soft rule allow the action: only those the last direct
// user message consents to, or misreads of the rule as well.
export type JudgeOverturns = 'consent' | 'any';

export type JudgeStatus = 'confirmed' | 'overturned' | 'held' | 'failed';

export type JudgeFailure = 'credential' | 'policy' | 'request' | 'timeout' | 'unreadable';

export interface JudgeDiagnostics {
  readonly status: JudgeStatus;
  readonly failureReason: JudgeFailure | null;
  readonly overturnBasis: OverturnBasis | null;
  readonly model: string;

  // The model that wrote the reply, which a claude -p safety fallback makes
  // differ from the configured one; null when no reply came back.
  readonly answeringModel: string | null;
  readonly safetyStops: number | null;
  readonly rule: string;
  readonly tier: 'hard' | 'soft';
  readonly elapsedMs: number;
}
