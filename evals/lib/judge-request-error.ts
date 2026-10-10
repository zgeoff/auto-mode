export type JudgeFailureReason = 'timeout' | 'request';

// A judge transport that times out or fails throws this; the run records the
// sample as not scorable. Any other error is the harness refusing the request.
export class JudgeRequestError extends Error {
  readonly reason: JudgeFailureReason;

  constructor(reason: JudgeFailureReason, options?: Readonly<ErrorOptions>) {
    super(`The judge request failed: ${reason}.`, options);

    this.name = 'JudgeRequestError';
    this.reason = reason;
  }
}
