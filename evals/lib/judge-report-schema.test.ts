import { expect, test } from 'bun:test';
import invariant from 'tiny-invariant';
import type * as z from 'zod';
import { judgeReportSchema } from './judge-report-schema.ts';

test('it accepts a recorded judge run with a judged sample', () => {
  const report: z.input<typeof judgeReportSchema> = {
    preset: 'glm',
    model: 'glm-4.6',
    samplesPerCase: 3,
    requestsSent: 4,
    policyHash: 'p',
    corpusHash: 'h',
    eligibleFrom: ['baseline'],
    records: [
      {
        case: 'real-01',
        sample: 1,
        verdict: 'block',
        rule: 'Data Exfiltration',
        failureReason: null,
        elapsedMs: 1450,
        outputTokens: 212,
        tail: null,
      },
    ],
  };

  expect(judgeReportSchema.safeParse(report).data).toStrictEqual(report);
});

test('it accepts a recorded judge run with a failed sample', () => {
  const report: z.input<typeof judgeReportSchema> = {
    preset: 'glm',
    model: 'glm-4.6',
    samplesPerCase: 3,
    requestsSent: 4,
    policyHash: 'p',
    corpusHash: 'h',
    eligibleFrom: ['baseline', 'guidance'],
    records: [
      {
        case: 'real-01',
        sample: 3,
        verdict: 'failure',
        rule: null,
        failureReason: 'timeout',
        elapsedMs: 1450,
        outputTokens: null,
        tail: '...',
      },
    ],
  };

  expect(judgeReportSchema.safeParse(report).data).toStrictEqual(report);
});

test('it drops a field the report does not define', () => {
  const result = judgeReportSchema.safeParse({
    preset: 'glm',
    model: 'glm-4.6',
    samplesPerCase: 3,
    requestsSent: 4,
    policyHash: 'p',
    corpusHash: 'h',
    eligibleFrom: ['baseline'],
    records: [
      {
        case: 'real-01',
        sample: 1,
        verdict: 'block',
        rule: 'Data Exfiltration',
        failureReason: null,
        elapsedMs: 1450,
        outputTokens: 212,
        tail: null,
        note: 'retried',
      },
    ],
  });

  expect(result.data).toStrictEqual({
    preset: 'glm',
    model: 'glm-4.6',
    samplesPerCase: 3,
    requestsSent: 4,
    policyHash: 'p',
    corpusHash: 'h',
    eligibleFrom: ['baseline'],
    records: [
      {
        case: 'real-01',
        sample: 1,
        verdict: 'block',
        rule: 'Data Exfiltration',
        failureReason: null,
        elapsedMs: 1450,
        outputTokens: 212,
        tail: null,
      },
    ],
  });
});

test('it rejects a report without its preset', () => {
  const result = judgeReportSchema.safeParse({
    model: 'glm-4.6',
    samplesPerCase: 3,
    requestsSent: 4,
    policyHash: 'p',
    corpusHash: 'h',
    eligibleFrom: ['baseline'],
    records: [
      {
        case: 'real-01',
        sample: 1,
        verdict: 'block',
        rule: 'Data Exfiltration',
        failureReason: null,
        elapsedMs: 1450,
        outputTokens: 212,
        tail: null,
      },
    ],
  });

  invariant(result.error);

  expect(result.error.issues).toPartiallyContain({ path: ['preset'] });
});

test('it rejects a report without its model', () => {
  const result = judgeReportSchema.safeParse({
    preset: 'glm',
    samplesPerCase: 3,
    requestsSent: 4,
    policyHash: 'p',
    corpusHash: 'h',
    eligibleFrom: ['baseline'],
    records: [
      {
        case: 'real-01',
        sample: 1,
        verdict: 'block',
        rule: 'Data Exfiltration',
        failureReason: null,
        elapsedMs: 1450,
        outputTokens: 212,
        tail: null,
      },
    ],
  });

  invariant(result.error);

  expect(result.error.issues).toPartiallyContain({ path: ['model'] });
});

test('it rejects a sample count per case other than 3', () => {
  const result = judgeReportSchema.safeParse({
    preset: 'glm',
    model: 'glm-4.6',
    samplesPerCase: 1,
    requestsSent: 4,
    policyHash: 'p',
    corpusHash: 'h',
    eligibleFrom: ['baseline'],
    records: [
      {
        case: 'real-01',
        sample: 1,
        verdict: 'block',
        rule: 'Data Exfiltration',
        failureReason: null,
        elapsedMs: 1450,
        outputTokens: 212,
        tail: null,
      },
    ],
  });

  invariant(result.error);

  expect(result.error.issues).toPartiallyContain({ path: ['samplesPerCase'] });
});

test('it rejects a request count that is not whole', () => {
  const result = judgeReportSchema.safeParse({
    preset: 'glm',
    model: 'glm-4.6',
    samplesPerCase: 3,
    requestsSent: 4.5,
    policyHash: 'p',
    corpusHash: 'h',
    eligibleFrom: ['baseline'],
    records: [
      {
        case: 'real-01',
        sample: 1,
        verdict: 'block',
        rule: 'Data Exfiltration',
        failureReason: null,
        elapsedMs: 1450,
        outputTokens: 212,
        tail: null,
      },
    ],
  });

  invariant(result.error);

  expect(result.error.issues).toPartiallyContain({ path: ['requestsSent'] });
});

test('it rejects a report without its policy hash', () => {
  const result = judgeReportSchema.safeParse({
    preset: 'glm',
    model: 'glm-4.6',
    samplesPerCase: 3,
    requestsSent: 4,
    corpusHash: 'h',
    eligibleFrom: ['baseline'],
    records: [
      {
        case: 'real-01',
        sample: 1,
        verdict: 'block',
        rule: 'Data Exfiltration',
        failureReason: null,
        elapsedMs: 1450,
        outputTokens: 212,
        tail: null,
      },
    ],
  });

  invariant(result.error);

  expect(result.error.issues).toPartiallyContain({ path: ['policyHash'] });
});

test('it rejects a report without its corpus hash', () => {
  const result = judgeReportSchema.safeParse({
    preset: 'glm',
    model: 'glm-4.6',
    samplesPerCase: 3,
    requestsSent: 4,
    policyHash: 'p',
    eligibleFrom: ['baseline'],
    records: [
      {
        case: 'real-01',
        sample: 1,
        verdict: 'block',
        rule: 'Data Exfiltration',
        failureReason: null,
        elapsedMs: 1450,
        outputTokens: 212,
        tail: null,
      },
    ],
  });

  invariant(result.error);

  expect(result.error.issues).toPartiallyContain({ path: ['corpusHash'] });
});

test('it rejects an eligible variant other than baseline or guidance', () => {
  const result = judgeReportSchema.safeParse({
    preset: 'glm',
    model: 'glm-4.6',
    samplesPerCase: 3,
    requestsSent: 4,
    policyHash: 'p',
    corpusHash: 'h',
    eligibleFrom: ['tuned'],
    records: [
      {
        case: 'real-01',
        sample: 1,
        verdict: 'block',
        rule: 'Data Exfiltration',
        failureReason: null,
        elapsedMs: 1450,
        outputTokens: 212,
        tail: null,
      },
    ],
  });

  invariant(result.error);

  expect(result.error.issues).toPartiallyContain({ path: ['eligibleFrom', 0] });
});

test('it rejects a report without records', () => {
  const result = judgeReportSchema.safeParse({
    preset: 'glm',
    model: 'glm-4.6',
    samplesPerCase: 3,
    requestsSent: 4,
    policyHash: 'p',
    corpusHash: 'h',
    eligibleFrom: ['baseline'],
  });

  invariant(result.error);

  expect(result.error.issues).toPartiallyContain({ path: ['records'] });
});

test('it rejects a record without its case', () => {
  const result = judgeReportSchema.safeParse({
    preset: 'glm',
    model: 'glm-4.6',
    samplesPerCase: 3,
    requestsSent: 4,
    policyHash: 'p',
    corpusHash: 'h',
    eligibleFrom: ['baseline'],
    records: [
      {
        sample: 1,
        verdict: 'block',
        rule: 'Data Exfiltration',
        failureReason: null,
        elapsedMs: 1450,
        outputTokens: 212,
        tail: null,
      },
    ],
  });

  invariant(result.error);

  expect(result.error.issues).toPartiallyContain({ path: ['records', 0, 'case'] });
});

test('it rejects a sample number below 1', () => {
  const result = judgeReportSchema.safeParse({
    preset: 'glm',
    model: 'glm-4.6',
    samplesPerCase: 3,
    requestsSent: 4,
    policyHash: 'p',
    corpusHash: 'h',
    eligibleFrom: ['baseline'],
    records: [
      {
        case: 'real-01',
        sample: 0,
        verdict: 'block',
        rule: 'Data Exfiltration',
        failureReason: null,
        elapsedMs: 1450,
        outputTokens: 212,
        tail: null,
      },
    ],
  });

  invariant(result.error);

  expect(result.error.issues).toPartiallyContain({ path: ['records', 0, 'sample'] });
});

test('it rejects a sample number above 3', () => {
  const result = judgeReportSchema.safeParse({
    preset: 'glm',
    model: 'glm-4.6',
    samplesPerCase: 3,
    requestsSent: 4,
    policyHash: 'p',
    corpusHash: 'h',
    eligibleFrom: ['baseline'],
    records: [
      {
        case: 'real-01',
        sample: 4,
        verdict: 'block',
        rule: 'Data Exfiltration',
        failureReason: null,
        elapsedMs: 1450,
        outputTokens: 212,
        tail: null,
      },
    ],
  });

  invariant(result.error);

  expect(result.error.issues).toPartiallyContain({ path: ['records', 0, 'sample'] });
});

test('it rejects a sample number that is not whole', () => {
  const result = judgeReportSchema.safeParse({
    preset: 'glm',
    model: 'glm-4.6',
    samplesPerCase: 3,
    requestsSent: 4,
    policyHash: 'p',
    corpusHash: 'h',
    eligibleFrom: ['baseline'],
    records: [
      {
        case: 'real-01',
        sample: 2.5,
        verdict: 'block',
        rule: 'Data Exfiltration',
        failureReason: null,
        elapsedMs: 1450,
        outputTokens: 212,
        tail: null,
      },
    ],
  });

  invariant(result.error);

  expect(result.error.issues).toPartiallyContain({ path: ['records', 0, 'sample'] });
});

test('it rejects a verdict other than allow, block, unreadable or failure', () => {
  const result = judgeReportSchema.safeParse({
    preset: 'glm',
    model: 'glm-4.6',
    samplesPerCase: 3,
    requestsSent: 4,
    policyHash: 'p',
    corpusHash: 'h',
    eligibleFrom: ['baseline'],
    records: [
      {
        case: 'real-01',
        sample: 1,
        verdict: 'ask',
        rule: 'Data Exfiltration',
        failureReason: null,
        elapsedMs: 1450,
        outputTokens: 212,
        tail: null,
      },
    ],
  });

  invariant(result.error);

  expect(result.error.issues).toPartiallyContain({ path: ['records', 0, 'verdict'] });
});

test('it rejects a record without its rule', () => {
  const result = judgeReportSchema.safeParse({
    preset: 'glm',
    model: 'glm-4.6',
    samplesPerCase: 3,
    requestsSent: 4,
    policyHash: 'p',
    corpusHash: 'h',
    eligibleFrom: ['baseline'],
    records: [
      {
        case: 'real-01',
        sample: 1,
        verdict: 'block',
        failureReason: null,
        elapsedMs: 1450,
        outputTokens: 212,
        tail: null,
      },
    ],
  });

  invariant(result.error);

  expect(result.error.issues).toPartiallyContain({ path: ['records', 0, 'rule'] });
});

test('it rejects a record without its failure reason', () => {
  const result = judgeReportSchema.safeParse({
    preset: 'glm',
    model: 'glm-4.6',
    samplesPerCase: 3,
    requestsSent: 4,
    policyHash: 'p',
    corpusHash: 'h',
    eligibleFrom: ['baseline'],
    records: [
      {
        case: 'real-01',
        sample: 1,
        verdict: 'block',
        rule: 'Data Exfiltration',
        elapsedMs: 1450,
        outputTokens: 212,
        tail: null,
      },
    ],
  });

  invariant(result.error);

  expect(result.error.issues).toPartiallyContain({ path: ['records', 0, 'failureReason'] });
});

test('it rejects an elapsed time that is not whole', () => {
  const result = judgeReportSchema.safeParse({
    preset: 'glm',
    model: 'glm-4.6',
    samplesPerCase: 3,
    requestsSent: 4,
    policyHash: 'p',
    corpusHash: 'h',
    eligibleFrom: ['baseline'],
    records: [
      {
        case: 'real-01',
        sample: 1,
        verdict: 'block',
        rule: 'Data Exfiltration',
        failureReason: null,
        elapsedMs: 1450.5,
        outputTokens: 212,
        tail: null,
      },
    ],
  });

  invariant(result.error);

  expect(result.error.issues).toPartiallyContain({ path: ['records', 0, 'elapsedMs'] });
});

test('it rejects an output token count that is not whole', () => {
  const result = judgeReportSchema.safeParse({
    preset: 'glm',
    model: 'glm-4.6',
    samplesPerCase: 3,
    requestsSent: 4,
    policyHash: 'p',
    corpusHash: 'h',
    eligibleFrom: ['baseline'],
    records: [
      {
        case: 'real-01',
        sample: 1,
        verdict: 'block',
        rule: 'Data Exfiltration',
        failureReason: null,
        elapsedMs: 1450,
        outputTokens: 212.5,
        tail: null,
      },
    ],
  });

  invariant(result.error);

  expect(result.error.issues).toPartiallyContain({ path: ['records', 0, 'outputTokens'] });
});

test('it rejects a record without its tail', () => {
  const result = judgeReportSchema.safeParse({
    preset: 'glm',
    model: 'glm-4.6',
    samplesPerCase: 3,
    requestsSent: 4,
    policyHash: 'p',
    corpusHash: 'h',
    eligibleFrom: ['baseline'],
    records: [
      {
        case: 'real-01',
        sample: 1,
        verdict: 'block',
        rule: 'Data Exfiltration',
        failureReason: null,
        elapsedMs: 1450,
        outputTokens: 212,
      },
    ],
  });

  invariant(result.error);

  expect(result.error.issues).toPartiallyContain({ path: ['records', 0, 'tail'] });
});
