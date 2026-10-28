import { readTextFile } from '../../src/config/read-text-file.ts';
import type { HostEnvironment, Runtime } from '../../src/config/types.ts';
import { readCheckout } from '../../src/git/read-checkout.ts';
import { buildMockHostEnvironment } from './build-mock-host-environment.ts';

type MockRuntimeOverrides = Partial<HostEnvironment> & Partial<Omit<Runtime, 'host'>>;

export function buildMockRuntime(overrides: MockRuntimeOverrides = {}): Runtime {
  const {
    now,
    timeout,
    fetch: send,
    readCheckout: reader,
    readTextFile: readText,
    ...host
  } = overrides;

  return {
    host: buildMockHostEnvironment(host),
    now: now ?? Date.now,
    timeout: timeout ?? ((timeoutMs) => AbortSignal.timeout(timeoutMs)),
    fetch: send ?? sendThroughGlobalFetch,
    readCheckout: reader ?? readCheckout,
    readTextFile: readText ?? readTextFile,
  };
}

// MSW replaces the global fetch, so the call reads it each time instead of
// holding the function it found when the runtime was built.
function sendThroughGlobalFetch(url: string, init: Readonly<RequestInit>): Promise<Response> {
  return fetch(url, init);
}
