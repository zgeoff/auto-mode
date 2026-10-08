import { expect, test } from 'bun:test';
import { buildMockJevReport } from './build-mock-jev-report.ts';

test('it builds a default Jev report', () => {
  expect(buildMockJevReport()).toStrictEqual({
    variant: 'baseline',
    model: expect.toBeString(),
    threshold: 0.8,
    samplesPerCase: 3,
    requestsSent: expect.toBePositive(),
    policyHash: expect.toSatisfy((hash: string) => /^[\da-f]{64}$/iu.test(hash)),
    guidanceHash: null,
    configuredRulesHash: expect.toSatisfy((hash: string) => /^[\da-f]{64}$/iu.test(hash)),
    corpusHash: expect.toSatisfy((hash: string) => /^[\da-f]{64}$/iu.test(hash)),
    records: [],
  });
});

test('it applies overrides on top of the defaults', () => {
  const report = buildMockJevReport({ variant: 'guidance', guidanceHash: 'g', requestsSent: 6 });

  expect(report).toStrictEqual({
    variant: 'guidance',
    model: expect.toBeString(),
    threshold: 0.8,
    samplesPerCase: 3,
    requestsSent: 6,
    policyHash: expect.toSatisfy((hash: string) => /^[\da-f]{64}$/iu.test(hash)),
    guidanceHash: 'g',
    configuredRulesHash: expect.toSatisfy((hash: string) => /^[\da-f]{64}$/iu.test(hash)),
    corpusHash: expect.toSatisfy((hash: string) => /^[\da-f]{64}$/iu.test(hash)),
    records: [],
  });
});
