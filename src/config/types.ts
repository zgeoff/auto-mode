export interface EvaluationOptions {
  readonly deadlineAt?: number | undefined;
  readonly signal?: Readonly<AbortSignal> | undefined;
}
