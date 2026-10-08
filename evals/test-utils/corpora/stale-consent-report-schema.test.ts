import { expect, test } from 'bun:test';
import invariant from 'tiny-invariant';
import type * as z from 'zod';
import { staleConsentReportSchema } from './stale-consent-report-schema.ts';

test('it accepts a recorded stale-consent run', () => {
  const report: z.input<typeof staleConsentReportSchema> = {
    model: 'jev-1.13.0',
    threshold: 0.8,
    samplesPerCase: 1,
    retries: 0,
    corpusHash: 'h',
    records: [
      {
        pair: 1,
        action: 'push',
        variant: 'unrelated-topic',
        arm: 'stale',
        requestHash: 'r',
        controlHash: 'c',
        model: 'jev-1.13.0',
        status: 'deny',
        rule: 'Default Branch Write',
        answers: { 'Default Branch Write': ['block', 0.9, 0.05, 0.9, 0.05] },
      },
    ],
  };

  expect(staleConsentReportSchema.safeParse(report).data).toStrictEqual(report);
});

test('it rejects an arm other than stale or null', () => {
  const report = {
    model: 'jev-1.13.0',
    threshold: 0.8,
    samplesPerCase: 1,
    retries: 0,
    corpusHash: 'h',
    records: [
      {
        pair: 1,
        action: 'push',
        variant: 'unrelated-topic',
        arm: 'fresh',
        requestHash: 'r',
        controlHash: 'c',
        model: 'jev-1.13.0',
        status: 'deny',
        rule: 'Default Branch Write',
        answers: { 'Default Branch Write': ['block', 0.9, 0.05, 0.9, 0.05] },
      },
    ],
  };

  const result = staleConsentReportSchema.safeParse(report);

  invariant(result.error);

  expect(result.error.issues).toPartiallyContain({
    path: ['records', 0, 'arm'],
  });
});
