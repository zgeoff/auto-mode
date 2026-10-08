import { expect, test } from 'bun:test';
import { buildMockVerdict } from './build-mock-verdict.ts';

test('it builds a default verdict', () => {
  expect(buildMockVerdict()).toStrictEqual({
    kind: 'deny',
    rule: expect.toBeString(),
    reason: expect.toBeString(),
  });
});

test('it applies overrides on top of the defaults', () => {
  expect(buildMockVerdict({ rule: 'Rule' })).toStrictEqual({
    kind: 'deny',
    rule: 'Rule',
    reason: expect.toBeString(),
  });
});

test('it builds an allow with no rule or reason', () => {
  expect(buildMockVerdict({ kind: 'allow' })).toStrictEqual({ kind: 'allow' });
});
