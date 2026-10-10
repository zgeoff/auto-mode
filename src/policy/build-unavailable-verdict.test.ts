import { expect, test } from 'bun:test';
import { buildUnavailableVerdict } from './build-unavailable-verdict.ts';

test('it denies as the unavailable classifier when the policy fails closed', () => {
  expect(buildUnavailableVerdict('deny', 'jev-1.13.0 unavailable: timed out')).toStrictEqual({
    kind: 'deny',
    rule: 'Classifier Unavailable',
    reason: 'jev-1.13.0 unavailable: timed out',
  });
});

test('it gives no verdict when the policy defers', () => {
  expect(buildUnavailableVerdict('defer', 'jev-1.13.0 unavailable: timed out')).toBeNull();
});
