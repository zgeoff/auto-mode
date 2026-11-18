import type { SessionScope } from '../scope/types.ts';
import type { ScopeRecordOptions } from '../scope/update-session-scope.ts';

export type StubScopeEventCheck = { readonly confirms: SessionScope } | { readonly fails: string };

export interface StubScopeEventVerifier {
  readonly verifyEvent: NonNullable<ScopeRecordOptions['verifyEvent']>;
}

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
