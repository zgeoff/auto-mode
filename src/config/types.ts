import type { TaskScopeSummary } from '../model/types.ts';

export interface EvaluationOptions {
  readonly deadlineAt?: number | undefined;
  readonly signal?: Readonly<AbortSignal> | undefined;
  readonly taskScope?: TaskScopeSummary | undefined;
}
