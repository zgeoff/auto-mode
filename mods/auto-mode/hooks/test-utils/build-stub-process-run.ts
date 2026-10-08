import type { ProcessInput, ProcessResult } from '../types.ts';

type ProcessRunOutcome = { readonly result: ProcessResult } | { readonly failure: string };

interface ProcessRunCall {
  readonly argv: readonly string[];
  readonly timeoutMs: number | undefined;
  readonly request: unknown;
}

interface StubProcessRun {
  readonly calls: readonly ProcessRunCall[];
  readonly hook: (api: unknown, input: ProcessInput) => { readonly value: ProcessResult };
}

export function buildStubProcessRun(outcome: ProcessRunOutcome): StubProcessRun {
  const calls: ProcessRunCall[] = [];

  return {
    calls,
    hook: (_api, input) => {
      const stdin = input.init?.stdin;

      calls.push({
        argv: input.argv,
        timeoutMs: input.init?.timeoutMs,
        request: stdin === undefined ? undefined : JSON.parse(stdin),
      });

      if ('failure' in outcome) {
        throw new Error(outcome.failure);
      }

      return { value: outcome.result };
    },
  };
}
