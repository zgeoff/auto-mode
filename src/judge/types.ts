export type JudgeReply =
  | { readonly kind: 'confirm' | 'overturn'; readonly reason: string }
  | { readonly kind: 'unreadable' };

export type JudgeStatus = 'confirmed' | 'overturned' | 'held' | 'failed';

export type JudgeFailure = 'credential' | 'policy' | 'request' | 'timeout' | 'unreadable';

export interface JudgeDiagnostics {
  readonly status: JudgeStatus;
  readonly failureReason: JudgeFailure | null;
  readonly model: string;
  readonly rule: string;
  readonly tier: 'hard' | 'soft';
  readonly elapsedMs: number;
}
