import type { DecisionFailureReason } from './types.ts';

export class DecisionRequestError extends Error {
  readonly reason: DecisionFailureReason;

  readonly requestBytes: number;

  constructor(
    reason: DecisionFailureReason,
    requestBytes: number,
    message: string,
    options?: Readonly<ErrorOptions>,
  ) {
    super(message, options);

    this.name = 'DecisionRequestError';
    this.reason = reason;
    this.requestBytes = requestBytes;
  }
}
