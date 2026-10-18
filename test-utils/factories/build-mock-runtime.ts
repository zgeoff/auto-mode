import type { HostEnvironment, Runtime } from '../../src/config/types.ts';
import { findCheckout } from '../../src/git/find-checkout.ts';
import { buildMockHostEnvironment } from './build-mock-host-environment.ts';

type MockRuntimeOverrides = Partial<HostEnvironment> & Partial<Omit<Runtime, 'host'>>;

// The host fields build a mock host, whose home does not exist unless a test
// passes one. The clock, the timers, fetch and the checkout lookup default to
// the real ones, so the MSW handlers still answer the requests a test makes.
export function buildMockRuntime(overrides: MockRuntimeOverrides = {}): Runtime {
  const { now, timeout, fetch: send, findCheckout: find, ...host } = overrides;

  return {
    host: buildMockHostEnvironment(host),
    now: now ?? Date.now,
    timeout: timeout ?? ((timeoutMs) => AbortSignal.timeout(timeoutMs)),
    fetch: send ?? ((url, init) => fetch(url, init)),
    findCheckout: find ?? ((start, env) => findCheckout(start, env)),
  };
}
