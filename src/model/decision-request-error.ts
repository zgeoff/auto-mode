import type { DecisionFailureReason } from './types.ts';

export class DecisionRequestError extends Error {
  readonly reason: DecisionFailureReason;

  constructor(reason: DecisionFailureReason, message: string) {
    super(message);

    this.name = 'DecisionRequestError';
    this.reason = reason;
  }
}
