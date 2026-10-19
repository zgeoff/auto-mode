import { readCheckout } from '../git/read-checkout.ts';
import { readHostEnvironment } from './read-host-environment.ts';
import type { Runtime } from './types.ts';

export function readRuntime(): Runtime {
  return {
    host: readHostEnvironment(),
    now: Date.now,
    timeout: (timeoutMs) => AbortSignal.timeout(timeoutMs),
    fetch: sendThroughGlobalFetch,
    readCheckout: (start, env) => readCheckout(start, env),
  };
}

function sendThroughGlobalFetch(url: string, init: Readonly<RequestInit>): Promise<Response> {
  return fetch(url, init);
}
