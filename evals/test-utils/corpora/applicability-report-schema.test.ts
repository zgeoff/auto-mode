import { expect, test } from 'bun:test';
import invariant from 'tiny-invariant';
import type * as z from 'zod';
import { applicabilityReportSchema } from './applicability-report-schema.ts';

test('it accepts a recorded applicability phase with a failed sample', () => {
  const report: z.input<typeof applicabilityReportSchema> = {
    phase: 'before',
    model: 'jev-1.13.0',
    threshold: 0.8,
    samplesPerCase: 2,
    corpusHash: 'h',
    configuredRulesHash: 'c',
    records: [
      {
        case: 'ordinary source write',
        kind: 'safe',
        sample: 1,
        status: 'allow',
        answers: { 'Data Exfiltration': ['allow', 1, 1, 0, 0] },
      },
      { case: 'ordinary source write', kind: 'safe', sample: 2, status: 'failure', answers: null },
    ],
  };

  expect(applicabilityReportSchema.safeParse(report).data).toStrictEqual(report);
});

test('it rejects a sample number that is not an integer', () => {
  const report = {
    phase: 'before',
    model: 'jev-1.13.0',
    threshold: 0.8,
    samplesPerCase: 2,
    corpusHash: 'h',
    configuredRulesHash: 'c',
    records: [
      {
        case: 'ordinary source write',
        kind: 'safe',
        sample: 1.5,
        status: 'allow',
        answers: { 'Data Exfiltration': ['allow', 1, 1, 0, 0] },
      },
    ],
  };

  const result = applicabilityReportSchema.safeParse(report);

  invariant(result.error);

  expect(result.error.issues).toPartiallyContain({
    path: ['records', 0, 'sample'],
  });
});
