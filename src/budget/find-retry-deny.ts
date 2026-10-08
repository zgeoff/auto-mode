import type { Verdict } from '../request/types.ts';
import type { DenialState } from './types.ts';

// A retry of the action just denied is denied again without the classifier, so
// a stochastic classifier cannot be asked until it allows.
export function findRetryDeny(state: Readonly<DenialState>, retryKey: string): Verdict | null {
  if (state.lastDenied === null || state.lastDenied.retryKey !== retryKey) {
    return null;
  }

  return { kind: 'deny', rule: state.lastDenied.rule, reason: state.lastDenied.reason };
}
