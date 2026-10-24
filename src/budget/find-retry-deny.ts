import type { Verdict } from '../request/types.ts';
import type { DenialState } from './types.ts';

export function findRetryDeny(state: Readonly<DenialState>, retryKey: string): Verdict | null {
  if (state.lastDenied === null || state.lastDenied.retryKey !== retryKey) {
    return null;
  }

  return { kind: 'deny', rule: state.lastDenied.rule, reason: state.lastDenied.reason };
}
