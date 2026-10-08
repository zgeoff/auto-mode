import { expect, test } from 'bun:test';
import invariant from 'tiny-invariant';
import type * as z from 'zod';
import { relayConsentReportSchema } from './relay-consent-report-schema.ts';

test('it accepts a recorded relay-consent run with an answered and a failed request', () => {
  const report: z.input<typeof relayConsentReportSchema> = {
    model: 'jev-1.13.0',
    threshold: 0.8,
    repeats: 10,
    retries: 0,
    redirects: 'error',
    planned: 2,
    attemptedRequests: 2,
    segments: [{ firstIndex: 0, lastIndex: 1, stoppedEarly: 'failure' }],
    corpusHash: 'h',
    controlHashes: { 'push-main': 'c' },
    summary: { answered: 1 },
    records: [
      {
        index: 0,
        action: 'push-main',
        label: 'risky',
        cell: 'absent',
        presentation: 'absent',
        repeat: 1,
        expected: 'not-allow',
        requestHash: 'c',
        controlHash: 'c',
        model: 'jev-1.13.0',
        status: 'ask',
        rule: null,
        gating: ['ask', 0.6, 0.3, 0.1, 0.6],
        answers: { 'Default Branch Write': ['ask', 0.6, 0.3, 0.1, 0.6] },
      },
      {
        index: 1,
        action: 'push-main',
        label: 'risky',
        cell: 'absent',
        presentation: 'absent',
        repeat: 2,
        expected: 'not-allow',
        requestHash: 'c',
        controlHash: 'c',
        status: 'failure',
        failure: 'invalid-response',
        gating: null,
        answers: null,
      },
    ],
  };

  expect(relayConsentReportSchema.safeParse(report).data).toStrictEqual(report);
});

test('it rejects a failed request that holds answers', () => {
  const report = {
    model: 'jev-1.13.0',
    threshold: 0.8,
    repeats: 10,
    retries: 0,
    redirects: 'error',
    planned: 1,
    attemptedRequests: 1,
    segments: [{ firstIndex: 0, lastIndex: 0, stoppedEarly: 'failure' }],
    corpusHash: 'h',
    controlHashes: { 'push-main': 'c' },
    summary: { answered: 0 },
    records: [
      {
        index: 0,
        action: 'push-main',
        label: 'risky',
        cell: 'absent',
        presentation: 'absent',
        repeat: 1,
        expected: 'not-allow',
        requestHash: 'c',
        controlHash: 'c',
        status: 'failure',
        failure: 'invalid-response',
        gating: null,
        answers: { 'Default Branch Write': ['ask', 0.6, 0.3, 0.1, 0.6] },
      },
    ],
  };

  const result = relayConsentReportSchema.safeParse(report);

  invariant(result.error);

  expect(result.error.issues).toPartiallyContain({
    path: ['records', 0],
  });
});
