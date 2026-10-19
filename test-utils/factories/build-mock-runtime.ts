import type { HostEnvironment, Runtime } from '../../src/config/types.ts';
import { readCheckout } from '../../src/git/read-checkout.ts';
import { buildMockHostEnvironment } from './build-mock-host-environment.ts';

type MockRuntimeOverrides = Partial<HostEnvironment> & Partial<Omit<Runtime, 'host'>>;

// The host fields build a mock host, whose home does not exist unless a test
// passes one. The clock, the timers, fetch and the checkout lookup default to
// the real ones, so the MSW handlers still answer the requests a test makes.
export function buildMockRuntime(overrides: MockRuntimeOverrides = {}): Runtime {
  const { now, timeout, fetch: send, readCheckout: reader, ...host } = overrides;

  return {
    host: buildMockHostEnvironment(host),
    now: now ?? Date.now,
    timeout: timeout ?? ((timeoutMs) => AbortSignal.timeout(timeoutMs)),
    fetch: send ?? sendThroughGlobalFetch,
    readCheckout: reader ?? readRealCheckout,
  };
}

// MSW replaces the global fetch, so the call reads it each time instead of
// holding the function it found when the runtime was built.
function sendThroughGlobalFetch(url: string, init: Readonly<RequestInit>): Promise<Response> {
  return fetch(url, init);
}

function readRealCheckout(start: string, env: HostEnvironment['env']) {
  return readCheckout(start, env);
}
