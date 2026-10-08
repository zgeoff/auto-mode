import { expect, test } from 'bun:test';
import { findRetryDeny } from './find-retry-deny.ts';

const STATE = {
  consecutive: 1,
  session: 1,
  lastDenied: { retryKey: 'action-a', rule: 'Rule', reason: 'Base reason.' },
};

test('it denies a retry of the action just denied with the same rule and reason', () => {
  expect(findRetryDeny(STATE, 'action-a')).toStrictEqual({
    kind: 'deny',
    rule: 'Rule',
    reason: 'Base reason.',
  });
});

test('it finds no retry for a different action', () => {
  expect(findRetryDeny(STATE, 'action-b')).toBeNull();
});
