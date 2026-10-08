import type { ProcessInput, ProcessResult } from '../types.ts';

type ProcessRunOutcome = { readonly result: ProcessResult } | { readonly failure: string };

interface ProcessRunCall {
  readonly argv: readonly string[];
  readonly timeoutMs: number | undefined;
  readonly request: Readonly<Record<string, unknown>> | undefined;
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
        request: stdin === undefined ? undefined : parseRequest(stdin),
      });

      // The host reports a throwing hook as skipped, so the unit receives a host
      // failure and never this text.
      if ('failure' in outcome) {
        throw new Error(outcome.failure);
      }

      return { value: outcome.result };
    },
  };
}

// The CLI reads one JSON object on stdin; any other body is recorded as no request.
function parseRequest(stdin: string): Readonly<Record<string, unknown>> | undefined {
  const body: unknown = JSON.parse(stdin);

  return isRecord(body) ? body : undefined;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
