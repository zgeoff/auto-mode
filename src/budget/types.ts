export interface DenialBudget {
  readonly consecutive: number;
  readonly perSession: number;
}

export interface DenialState {
  readonly consecutive: number;
  readonly session: number;
  readonly lastDenied: {
    readonly retryKey: string;
    readonly rule: string;
    readonly reason: string;
  } | null;
}

export const EMPTY_DENIAL_STATE: DenialState = { consecutive: 0, session: 0, lastDenied: null };
