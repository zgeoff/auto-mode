import { expect, test } from 'bun:test';
import { buildMockJevRecord } from './build-mock-jev-record.ts';

test('it builds a default Jev record', () => {
  expect(buildMockJevRecord()).toStrictEqual({
    case: expect.toBeString(),
    sample: 1,
    status: 'allow',
    failureReason: null,
    rule: null,
    ruleCount: 1,
    contributors: [],
    elapsedMs: expect.toBePositive(),
    requestBytes: expect.toBePositive(),
  });
});

test('it applies overrides on top of the defaults', () => {
  const record = buildMockJevRecord({
    case: 'real-01',
    sample: 2,
    status: 'failure',
    failureReason: 'network',
  });

  expect(record).toStrictEqual({
    case: 'real-01',
    sample: 2,
    status: 'failure',
    failureReason: 'network',
    rule: null,
    ruleCount: 1,
    contributors: [],
    elapsedMs: expect.toBePositive(),
    requestBytes: expect.toBePositive(),
  });
});
