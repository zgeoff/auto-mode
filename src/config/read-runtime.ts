import { findCheckout } from '../git/find-checkout.ts';
import { readHostEnvironment } from './read-host-environment.ts';
import type { Runtime } from './types.ts';

export function readRuntime(): Runtime {
  return {
    host: readHostEnvironment(),
    now: Date.now,
    timeout: (ms) => AbortSignal.timeout(ms),
    fetch: (url, init) => fetch(url, init),
    findCheckout: (start, env) => findCheckout(start, env),
  };
}
