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
    completedAt: '2026-10-05T14:12:12.368Z',
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
        elapsedMs: 812,
        answers: { 'Default Branch Write': ['block', 0.9, 0.05, 0.9, 0.05] },
      },
    ],
  };

  expect(staleConsentReportSchema.safeParse(report).data).toStrictEqual(report);
});

test('it rejects an arm other than stale or null', () => {
  const result = staleConsentReportSchema.safeParse({
    model: 'jev-1.13.0',
    threshold: 0.8,
    samplesPerCase: 1,
    retries: 0,
    completedAt: '2026-10-05T14:12:12.368Z',
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
        elapsedMs: 812,
        answers: { 'Default Branch Write': ['block', 0.9, 0.05, 0.9, 0.05] },
      },
    ],
  });

  invariant(result.error);

  expect(result.error.issues).toPartiallyContain({ path: ['records', 0, 'arm'] });
});

test('it rejects a record without its elapsed time', () => {
  const result = staleConsentReportSchema.safeParse({
    model: 'jev-1.13.0',
    threshold: 0.8,
    samplesPerCase: 1,
    retries: 0,
    completedAt: '2026-10-05T14:12:12.368Z',
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
  });

  invariant(result.error);

  expect(result.error.issues).toPartiallyContain({ path: ['records', 0, 'elapsedMs'] });
});

test('it rejects a run without its completion time', () => {
  const result = staleConsentReportSchema.safeParse({
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
        elapsedMs: 812,
        answers: { 'Default Branch Write': ['block', 0.9, 0.05, 0.9, 0.05] },
      },
    ],
  });

  invariant(result.error);

  expect(result.error.issues).toPartiallyContain({ path: ['completedAt'] });
});
