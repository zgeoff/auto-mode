import type { TaskScopeSummary } from '../model/types.ts';

export interface HostEnvironment {
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly home: string;
}

export interface EvaluationOptions {
  readonly deadlineAt?: number | undefined;
  readonly signal?: Readonly<AbortSignal> | undefined;
  readonly taskScope?: TaskScopeSummary | undefined;
  readonly host?: Readonly<HostEnvironment> | undefined;
  readonly now?: (() => number) | undefined;
  readonly timeout?: ((ms: number) => AbortSignal) | undefined;
}
