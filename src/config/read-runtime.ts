import { readCheckout } from '../git/read-checkout.ts';
import { readHostEnvironment } from './read-host-environment.ts';
import type { Runtime } from './types.ts';

export function readRuntime(): Runtime {
  return {
    host: readHostEnvironment(),
    now: Date.now,
    timeout: (timeoutMs) => AbortSignal.timeout(timeoutMs),
    fetch: (url, init) => fetch(url, init),
    readCheckout: (start, env) => readCheckout(start, env),
  };
}
