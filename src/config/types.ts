import type { CheckoutReader } from '../git/types.ts';
import type { TaskScopeSummary } from '../types.ts';

export interface OutputStream {
  readonly write: (text: string) => unknown;
}

export interface HostEnvironment {
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly home: string;
  readonly scratchPaths?: readonly string[] | undefined;
}

export interface Runtime {
  readonly host: Readonly<HostEnvironment>;
  readonly now: () => number;
  readonly timeout: (timeoutMs: number) => AbortSignal;
  readonly fetch: (url: string, init: Readonly<RequestInit>) => Promise<Response>;
  readonly readCheckout: CheckoutReader;
}

export interface ClaudeRules {
  readonly environment: readonly string[];
  readonly allow: readonly string[];
  readonly soft_deny: readonly string[];
  readonly hard_deny: readonly string[];
}

export interface ClaudeSettings {
  readonly rules: ClaudeRules;
  readonly userSettings: unknown;
}

export interface EvaluationOptions {
  readonly claudeSettings?: ClaudeSettings | undefined;
  readonly deadlineAt?: number | undefined;
  readonly signal?: Readonly<AbortSignal> | undefined;
  readonly taskScope?: TaskScopeSummary | undefined;
  readonly runtime: Readonly<Runtime>;
}

export type KeyOptions = Pick<EvaluationOptions, 'deadlineAt' | 'signal' | 'runtime'>;
