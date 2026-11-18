import { expect, test } from 'bun:test';
import { buildMockJudgeReport } from './build-mock-judge-report.ts';

test('it builds a default judge report', () => {
  expect(buildMockJudgeReport()).toStrictEqual({
    preset: expect.toBeString(),
    model: expect.toBeString(),
    samplesPerCase: 3,
    requestsSent: expect.toBePositive(),
    policyHash: expect.toSatisfy((hash: string) => /^[\da-f]{64}$/iu.test(hash)),
    corpusHash: expect.toSatisfy((hash: string) => /^[\da-f]{64}$/iu.test(hash)),
    eligibleFrom: ['baseline'],
    records: [],
  });
});

test('it applies overrides on top of the defaults', () => {
  const report = buildMockJudgeReport({ preset: 'glm', eligibleFrom: ['baseline', 'guidance'] });

  expect(report).toStrictEqual({
    preset: 'glm',
    model: expect.toBeString(),
    samplesPerCase: 3,
    requestsSent: expect.toBePositive(),
    policyHash: expect.toSatisfy((hash: string) => /^[\da-f]{64}$/iu.test(hash)),
    corpusHash: expect.toSatisfy((hash: string) => /^[\da-f]{64}$/iu.test(hash)),
    eligibleFrom: ['baseline', 'guidance'],
    records: [],
  });
});
