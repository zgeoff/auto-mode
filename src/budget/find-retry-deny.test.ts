import { expect, test } from 'bun:test';
import { buildMockDenialState } from '../../test-utils/factories/build-mock-denial-state.ts';
import { findRetryDeny } from './find-retry-deny.ts';

test('it denies a retry of the action just denied with the same rule and reason', () => {
  const state = buildMockDenialState({
    consecutive: 1,
    session: 1,
    lastDenied: { retryKey: 'action-a', rule: 'Rule', reason: 'Base reason.' },
  });

  expect(findRetryDeny(state, 'action-a')).toStrictEqual({
    kind: 'deny',
    rule: 'Rule',
    reason: 'Base reason.',
  });
});

test('it finds no retry for a different action', () => {
  const state = buildMockDenialState({
    consecutive: 1,
    session: 1,
    lastDenied: { retryKey: 'action-a', rule: 'Rule', reason: 'Base reason.' },
  });

  expect(findRetryDeny(state, 'action-b')).toBeNull();
});

test('it finds no retry when the session has no denial yet', () => {
  expect(findRetryDeny(buildMockDenialState({ lastDenied: null }), 'action-a')).toBeNull();
});
