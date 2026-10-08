import type { TaskScopeSummary } from '../model/types.ts';

export interface OutputStream {
  readonly write: (text: string) => unknown;
}

export interface HostEnvironment {
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly home: string;
  readonly scratchPaths?: readonly string[] | undefined;
}

export interface EvaluationOptions {
  readonly deadlineAt?: number | undefined;
  readonly signal?: Readonly<AbortSignal> | undefined;
  readonly taskScope?: TaskScopeSummary | undefined;
  readonly host?: Readonly<HostEnvironment> | undefined;
  readonly now?: (() => number) | undefined;
  readonly timeout?: ((ms: number) => AbortSignal) | undefined;
}
