export type JudgeFailureReason = 'timeout' | 'request';

export class JudgeRequestError extends Error {
  readonly reason: JudgeFailureReason;

  constructor(reason: JudgeFailureReason, options?: Readonly<ErrorOptions>) {
    super(`The judge request failed: ${reason}.`, options);

    this.name = 'JudgeRequestError';
    this.reason = reason;
  }
}
