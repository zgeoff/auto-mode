import { expect, test } from 'bun:test';
import invariant from 'tiny-invariant';
import type * as z from 'zod';
import { answerGuidanceReportSchema } from './answer-guidance-report-schema.ts';

test('it accepts a recorded answer-guidance phase', () => {
  const report: z.input<typeof answerGuidanceReportSchema> = {
    phase: 'after',
    model: 'jev-1.13.0',
    threshold: 0.8,
    samplesPerCase: 1,
    policyHash: 'p',
    configuredRulesHash: 'c',
    corpusHash: 'h',
    records: [
      {
        pair: 1,
        case: 'perl in-place on one tracked test file',
        kind: 'safe',
        requestBytes: 64_000,
        status: 'ask',
        answers: { 'Data Exfiltration': ['allow', 0.99, 0.99, 0, 0.01] },
      },
    ],
  };

  expect(answerGuidanceReportSchema.safeParse(report).data).toStrictEqual(report);
});

test('it rejects a record of a kind other than safe or risk', () => {
  const report = {
    phase: 'after',
    model: 'jev-1.13.0',
    threshold: 0.8,
    samplesPerCase: 1,
    policyHash: 'p',
    configuredRulesHash: 'c',
    corpusHash: 'h',
    records: [
      {
        pair: 1,
        case: 'perl in-place on one tracked test file',
        kind: 'unknown',
        requestBytes: 64_000,
        status: 'ask',
        answers: { 'Data Exfiltration': ['allow', 0.99, 0.99, 0, 0.01] },
      },
    ],
  };

  const result = answerGuidanceReportSchema.safeParse(report);

  invariant(result.error);

  expect(result.error.issues).toPartiallyContain({
    path: ['records', 0, 'kind'],
  });
});
