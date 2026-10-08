import type { SessionScope } from '../src/scope/types.ts';
import type { ScopeRecordOptions } from '../src/scope/update-session-scope.ts';

export type StubScopeEventCheck = { readonly confirms: SessionScope } | { readonly fails: string };

export interface StubScopeEventVerifier {
  readonly verifyEvent: NonNullable<ScopeRecordOptions['verifyEvent']>;
}

// Stands in for the git and forge check of a claimed scope event: every event
// either confirms the one scope given or fails with the message given, whatever
// the event and the call it came from.
export function buildStubScopeEventVerifier(
  check: Readonly<StubScopeEventCheck>,
): StubScopeEventVerifier {
  return {
    verifyEvent: () =>
      'confirms' in check
        ? Promise.resolve(check.confirms)
        : Promise.reject(new Error(check.fails)),
  };
}
