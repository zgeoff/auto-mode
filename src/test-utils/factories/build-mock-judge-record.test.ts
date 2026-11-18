import { expect, test } from 'bun:test';
import { buildMockJudgeRecord } from './build-mock-judge-record.ts';

test('it builds a default judge record', () => {
  expect(buildMockJudgeRecord()).toStrictEqual({
    case: expect.toBeString(),
    sample: 1,
    verdict: 'allow',
    rule: null,
    failureReason: null,
    elapsedMs: expect.toBePositive(),
    outputTokens: expect.toBePositive(),
    tail: null,
  });
});

test('it applies overrides on top of the defaults', () => {
  const record = buildMockJudgeRecord({
    case: 'real-01',
    sample: 3,
    verdict: 'block',
    rule: 'Data Exfiltration',
  });

  expect(record).toStrictEqual({
    case: 'real-01',
    sample: 3,
    verdict: 'block',
    rule: 'Data Exfiltration',
    failureReason: null,
    elapsedMs: expect.toBePositive(),
    outputTokens: expect.toBePositive(),
    tail: null,
  });
});
