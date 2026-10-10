import { expect, test } from 'bun:test';
import invariant from 'tiny-invariant';
import type * as z from 'zod';
import { jevReportSchema } from './jev-report-schema.ts';

test('it accepts a recorded Jev run with an answered sample', () => {
  const report: z.input<typeof jevReportSchema> = {
    variant: 'baseline',
    model: 'jev-1.13.0',
    threshold: 0.8,
    samplesPerCase: 3,
    requestsSent: 6,
    policyHash: 'p',
    guidanceHash: null,
    configuredRulesHash: 'c',
    corpusHash: 'h',
    records: [
      {
        case: 'real-01',
        sample: 1,
        status: 'ask',
        failureReason: null,
        rule: 'Data Exfiltration',
        ruleCount: 12,
        contributors: [
          {
            rule: 'Data Exfiltration',
            tier: 'hard',
            choice: 'allow',
            confidence: 0.5,
            allow: 0.5,
            block: 0.3,
            ask: 0.2,
          },
        ],
        elapsedMs: 812,
        requestBytes: 2048,
      },
    ],
  };

  expect(jevReportSchema.safeParse(report).data).toStrictEqual(report);
});

test('it accepts a two-choice sample with the block probability of every rule', () => {
  const report: z.input<typeof jevReportSchema> = {
    variant: 'baseline',
    model: 'jev-1.13.0',
    threshold: 0.8,
    samplesPerCase: 3,
    requestsSent: 1,
    policyHash: 'p',
    guidanceHash: null,
    configuredRulesHash: 'c',
    corpusHash: 'h',
    records: [
      {
        case: 'real-01',
        sample: 1,
        status: 'ask',
        failureReason: null,
        rule: 'Data Exfiltration',
        ruleCount: 2,
        contributors: [
          {
            rule: 'Data Exfiltration',
            tier: 'hard',
            choice: 'allow',
            confidence: 0.7,
            allow: 0.7,
            block: 0.3,
            ask: 0,
          },
        ],
        blockProbabilities: { 'Data Exfiltration': 0.3, 'History Rewrite': 0.05 },
        elapsedMs: 812,
        requestBytes: 2048,
      },
    ],
  };

  expect(jevReportSchema.safeParse(report).data).toStrictEqual(report);
});

test('it accepts a recorded guidance run with a failed sample', () => {
  const report: z.input<typeof jevReportSchema> = {
    variant: 'guidance',
    model: 'jev-1.13.0',
    threshold: 0.8,
    samplesPerCase: 3,
    requestsSent: 6,
    policyHash: 'p',
    guidanceHash: 'g',
    configuredRulesHash: 'c',
    corpusHash: 'h',
    records: [
      {
        case: 'real-01',
        sample: 3,
        status: 'failure',
        failureReason: 'network',
        rule: null,
        ruleCount: 12,
        contributors: [],
        elapsedMs: 812,
        requestBytes: 2048,
      },
    ],
  };

  expect(jevReportSchema.safeParse(report).data).toStrictEqual(report);
});

test('it drops a field the report does not define', () => {
  const result = jevReportSchema.safeParse({
    variant: 'baseline',
    model: 'jev-1.13.0',
    threshold: 0.8,
    samplesPerCase: 3,
    requestsSent: 6,
    policyHash: 'p',
    guidanceHash: null,
    configuredRulesHash: 'c',
    corpusHash: 'h',
    records: [
      {
        case: 'real-01',
        sample: 1,
        status: 'ask',
        failureReason: null,
        rule: 'Data Exfiltration',
        ruleCount: 12,
        contributors: [
          {
            rule: 'Data Exfiltration',
            tier: 'hard',
            choice: 'allow',
            confidence: 0.5,
            allow: 0.5,
            block: 0.3,
            ask: 0.2,
          },
        ],
        elapsedMs: 812,
        requestBytes: 2048,
        note: 'retried',
      },
    ],
  });

  expect(result.data).toStrictEqual({
    variant: 'baseline',
    model: 'jev-1.13.0',
    threshold: 0.8,
    samplesPerCase: 3,
    requestsSent: 6,
    policyHash: 'p',
    guidanceHash: null,
    configuredRulesHash: 'c',
    corpusHash: 'h',
    records: [
      {
        case: 'real-01',
        sample: 1,
        status: 'ask',
        failureReason: null,
        rule: 'Data Exfiltration',
        ruleCount: 12,
        contributors: [
          {
            rule: 'Data Exfiltration',
            tier: 'hard',
            choice: 'allow',
            confidence: 0.5,
            allow: 0.5,
            block: 0.3,
            ask: 0.2,
          },
        ],
        elapsedMs: 812,
        requestBytes: 2048,
      },
    ],
  });
});

test('it rejects a variant other than baseline or guidance', () => {
  const result = jevReportSchema.safeParse({
    variant: 'tuned',
    model: 'jev-1.13.0',
    threshold: 0.8,
    samplesPerCase: 3,
    requestsSent: 6,
    policyHash: 'p',
    guidanceHash: null,
    configuredRulesHash: 'c',
    corpusHash: 'h',
    records: [
      {
        case: 'real-01',
        sample: 1,
        status: 'ask',
        failureReason: null,
        rule: 'Data Exfiltration',
        ruleCount: 12,
        contributors: [
          {
            rule: 'Data Exfiltration',
            tier: 'hard',
            choice: 'allow',
            confidence: 0.5,
            allow: 0.5,
            block: 0.3,
            ask: 0.2,
          },
        ],
        elapsedMs: 812,
        requestBytes: 2048,
      },
    ],
  });

  invariant(result.error);

  expect(result.error.issues).toPartiallyContain({ path: ['variant'] });
});

test('it rejects a report without its model', () => {
  const result = jevReportSchema.safeParse({
    variant: 'baseline',
    threshold: 0.8,
    samplesPerCase: 3,
    requestsSent: 6,
    policyHash: 'p',
    guidanceHash: null,
    configuredRulesHash: 'c',
    corpusHash: 'h',
    records: [
      {
        case: 'real-01',
        sample: 1,
        status: 'ask',
        failureReason: null,
        rule: 'Data Exfiltration',
        ruleCount: 12,
        contributors: [
          {
            rule: 'Data Exfiltration',
            tier: 'hard',
            choice: 'allow',
            confidence: 0.5,
            allow: 0.5,
            block: 0.3,
            ask: 0.2,
          },
        ],
        elapsedMs: 812,
        requestBytes: 2048,
      },
    ],
  });

  invariant(result.error);

  expect(result.error.issues).toPartiallyContain({ path: ['model'] });
});

test('it rejects a threshold other than 0.8', () => {
  const result = jevReportSchema.safeParse({
    variant: 'baseline',
    model: 'jev-1.13.0',
    threshold: 0.9,
    samplesPerCase: 3,
    requestsSent: 6,
    policyHash: 'p',
    guidanceHash: null,
    configuredRulesHash: 'c',
    corpusHash: 'h',
    records: [
      {
        case: 'real-01',
        sample: 1,
        status: 'ask',
        failureReason: null,
        rule: 'Data Exfiltration',
        ruleCount: 12,
        contributors: [
          {
            rule: 'Data Exfiltration',
            tier: 'hard',
            choice: 'allow',
            confidence: 0.5,
            allow: 0.5,
            block: 0.3,
            ask: 0.2,
          },
        ],
        elapsedMs: 812,
        requestBytes: 2048,
      },
    ],
  });

  invariant(result.error);

  expect(result.error.issues).toPartiallyContain({ path: ['threshold'] });
});

test('it rejects a sample count per case other than 3', () => {
  const result = jevReportSchema.safeParse({
    variant: 'baseline',
    model: 'jev-1.13.0',
    threshold: 0.8,
    samplesPerCase: 1,
    requestsSent: 6,
    policyHash: 'p',
    guidanceHash: null,
    configuredRulesHash: 'c',
    corpusHash: 'h',
    records: [
      {
        case: 'real-01',
        sample: 1,
        status: 'ask',
        failureReason: null,
        rule: 'Data Exfiltration',
        ruleCount: 12,
        contributors: [
          {
            rule: 'Data Exfiltration',
            tier: 'hard',
            choice: 'allow',
            confidence: 0.5,
            allow: 0.5,
            block: 0.3,
            ask: 0.2,
          },
        ],
        elapsedMs: 812,
        requestBytes: 2048,
      },
    ],
  });

  invariant(result.error);

  expect(result.error.issues).toPartiallyContain({ path: ['samplesPerCase'] });
});

test('it rejects a request count that is not whole', () => {
  const result = jevReportSchema.safeParse({
    variant: 'baseline',
    model: 'jev-1.13.0',
    threshold: 0.8,
    samplesPerCase: 3,
    requestsSent: 6.5,
    policyHash: 'p',
    guidanceHash: null,
    configuredRulesHash: 'c',
    corpusHash: 'h',
    records: [
      {
        case: 'real-01',
        sample: 1,
        status: 'ask',
        failureReason: null,
        rule: 'Data Exfiltration',
        ruleCount: 12,
        contributors: [
          {
            rule: 'Data Exfiltration',
            tier: 'hard',
            choice: 'allow',
            confidence: 0.5,
            allow: 0.5,
            block: 0.3,
            ask: 0.2,
          },
        ],
        elapsedMs: 812,
        requestBytes: 2048,
      },
    ],
  });

  invariant(result.error);

  expect(result.error.issues).toPartiallyContain({ path: ['requestsSent'] });
});

test('it rejects a report without its policy hash', () => {
  const result = jevReportSchema.safeParse({
    variant: 'baseline',
    model: 'jev-1.13.0',
    threshold: 0.8,
    samplesPerCase: 3,
    requestsSent: 6,
    guidanceHash: null,
    configuredRulesHash: 'c',
    corpusHash: 'h',
    records: [
      {
        case: 'real-01',
        sample: 1,
        status: 'ask',
        failureReason: null,
        rule: 'Data Exfiltration',
        ruleCount: 12,
        contributors: [
          {
            rule: 'Data Exfiltration',
            tier: 'hard',
            choice: 'allow',
            confidence: 0.5,
            allow: 0.5,
            block: 0.3,
            ask: 0.2,
          },
        ],
        elapsedMs: 812,
        requestBytes: 2048,
      },
    ],
  });

  invariant(result.error);

  expect(result.error.issues).toPartiallyContain({ path: ['policyHash'] });
});

test('it rejects a report without its guidance hash', () => {
  const result = jevReportSchema.safeParse({
    variant: 'baseline',
    model: 'jev-1.13.0',
    threshold: 0.8,
    samplesPerCase: 3,
    requestsSent: 6,
    policyHash: 'p',
    configuredRulesHash: 'c',
    corpusHash: 'h',
    records: [
      {
        case: 'real-01',
        sample: 1,
        status: 'ask',
        failureReason: null,
        rule: 'Data Exfiltration',
        ruleCount: 12,
        contributors: [
          {
            rule: 'Data Exfiltration',
            tier: 'hard',
            choice: 'allow',
            confidence: 0.5,
            allow: 0.5,
            block: 0.3,
            ask: 0.2,
          },
        ],
        elapsedMs: 812,
        requestBytes: 2048,
      },
    ],
  });

  invariant(result.error);

  expect(result.error.issues).toPartiallyContain({ path: ['guidanceHash'] });
});

test('it rejects a report without its configured rules hash', () => {
  const result = jevReportSchema.safeParse({
    variant: 'baseline',
    model: 'jev-1.13.0',
    threshold: 0.8,
    samplesPerCase: 3,
    requestsSent: 6,
    policyHash: 'p',
    guidanceHash: null,
    corpusHash: 'h',
    records: [
      {
        case: 'real-01',
        sample: 1,
        status: 'ask',
        failureReason: null,
        rule: 'Data Exfiltration',
        ruleCount: 12,
        contributors: [
          {
            rule: 'Data Exfiltration',
            tier: 'hard',
            choice: 'allow',
            confidence: 0.5,
            allow: 0.5,
            block: 0.3,
            ask: 0.2,
          },
        ],
        elapsedMs: 812,
        requestBytes: 2048,
      },
    ],
  });

  invariant(result.error);

  expect(result.error.issues).toPartiallyContain({ path: ['configuredRulesHash'] });
});

test('it rejects a report without its corpus hash', () => {
  const result = jevReportSchema.safeParse({
    variant: 'baseline',
    model: 'jev-1.13.0',
    threshold: 0.8,
    samplesPerCase: 3,
    requestsSent: 6,
    policyHash: 'p',
    guidanceHash: null,
    configuredRulesHash: 'c',
    records: [
      {
        case: 'real-01',
        sample: 1,
        status: 'ask',
        failureReason: null,
        rule: 'Data Exfiltration',
        ruleCount: 12,
        contributors: [
          {
            rule: 'Data Exfiltration',
            tier: 'hard',
            choice: 'allow',
            confidence: 0.5,
            allow: 0.5,
            block: 0.3,
            ask: 0.2,
          },
        ],
        elapsedMs: 812,
        requestBytes: 2048,
      },
    ],
  });

  invariant(result.error);

  expect(result.error.issues).toPartiallyContain({ path: ['corpusHash'] });
});

test('it rejects a report without records', () => {
  const result = jevReportSchema.safeParse({
    variant: 'baseline',
    model: 'jev-1.13.0',
    threshold: 0.8,
    samplesPerCase: 3,
    requestsSent: 6,
    policyHash: 'p',
    guidanceHash: null,
    configuredRulesHash: 'c',
    corpusHash: 'h',
  });

  invariant(result.error);

  expect(result.error.issues).toPartiallyContain({ path: ['records'] });
});

test('it rejects a record without its case', () => {
  const result = jevReportSchema.safeParse({
    variant: 'baseline',
    model: 'jev-1.13.0',
    threshold: 0.8,
    samplesPerCase: 3,
    requestsSent: 6,
    policyHash: 'p',
    guidanceHash: null,
    configuredRulesHash: 'c',
    corpusHash: 'h',
    records: [
      {
        sample: 1,
        status: 'ask',
        failureReason: null,
        rule: 'Data Exfiltration',
        ruleCount: 12,
        contributors: [
          {
            rule: 'Data Exfiltration',
            tier: 'hard',
            choice: 'allow',
            confidence: 0.5,
            allow: 0.5,
            block: 0.3,
            ask: 0.2,
          },
        ],
        elapsedMs: 812,
        requestBytes: 2048,
      },
    ],
  });

  invariant(result.error);

  expect(result.error.issues).toPartiallyContain({ path: ['records', 0, 'case'] });
});

test('it rejects a sample number below 1', () => {
  const result = jevReportSchema.safeParse({
    variant: 'baseline',
    model: 'jev-1.13.0',
    threshold: 0.8,
    samplesPerCase: 3,
    requestsSent: 6,
    policyHash: 'p',
    guidanceHash: null,
    configuredRulesHash: 'c',
    corpusHash: 'h',
    records: [
      {
        case: 'real-01',
        sample: 0,
        status: 'ask',
        failureReason: null,
        rule: 'Data Exfiltration',
        ruleCount: 12,
        contributors: [
          {
            rule: 'Data Exfiltration',
            tier: 'hard',
            choice: 'allow',
            confidence: 0.5,
            allow: 0.5,
            block: 0.3,
            ask: 0.2,
          },
        ],
        elapsedMs: 812,
        requestBytes: 2048,
      },
    ],
  });

  invariant(result.error);

  expect(result.error.issues).toPartiallyContain({ path: ['records', 0, 'sample'] });
});

test('it rejects a sample number above 3', () => {
  const result = jevReportSchema.safeParse({
    variant: 'baseline',
    model: 'jev-1.13.0',
    threshold: 0.8,
    samplesPerCase: 3,
    requestsSent: 6,
    policyHash: 'p',
    guidanceHash: null,
    configuredRulesHash: 'c',
    corpusHash: 'h',
    records: [
      {
        case: 'real-01',
        sample: 4,
        status: 'ask',
        failureReason: null,
        rule: 'Data Exfiltration',
        ruleCount: 12,
        contributors: [
          {
            rule: 'Data Exfiltration',
            tier: 'hard',
            choice: 'allow',
            confidence: 0.5,
            allow: 0.5,
            block: 0.3,
            ask: 0.2,
          },
        ],
        elapsedMs: 812,
        requestBytes: 2048,
      },
    ],
  });

  invariant(result.error);

  expect(result.error.issues).toPartiallyContain({ path: ['records', 0, 'sample'] });
});

test('it rejects a sample number that is not whole', () => {
  const result = jevReportSchema.safeParse({
    variant: 'baseline',
    model: 'jev-1.13.0',
    threshold: 0.8,
    samplesPerCase: 3,
    requestsSent: 6,
    policyHash: 'p',
    guidanceHash: null,
    configuredRulesHash: 'c',
    corpusHash: 'h',
    records: [
      {
        case: 'real-01',
        sample: 1.5,
        status: 'ask',
        failureReason: null,
        rule: 'Data Exfiltration',
        ruleCount: 12,
        contributors: [
          {
            rule: 'Data Exfiltration',
            tier: 'hard',
            choice: 'allow',
            confidence: 0.5,
            allow: 0.5,
            block: 0.3,
            ask: 0.2,
          },
        ],
        elapsedMs: 812,
        requestBytes: 2048,
      },
    ],
  });

  invariant(result.error);

  expect(result.error.issues).toPartiallyContain({ path: ['records', 0, 'sample'] });
});

test('it rejects a status other than allow, ask, deny or failure', () => {
  const result = jevReportSchema.safeParse({
    variant: 'baseline',
    model: 'jev-1.13.0',
    threshold: 0.8,
    samplesPerCase: 3,
    requestsSent: 6,
    policyHash: 'p',
    guidanceHash: null,
    configuredRulesHash: 'c',
    corpusHash: 'h',
    records: [
      {
        case: 'real-01',
        sample: 1,
        status: 'block',
        failureReason: null,
        rule: 'Data Exfiltration',
        ruleCount: 12,
        contributors: [
          {
            rule: 'Data Exfiltration',
            tier: 'hard',
            choice: 'allow',
            confidence: 0.5,
            allow: 0.5,
            block: 0.3,
            ask: 0.2,
          },
        ],
        elapsedMs: 812,
        requestBytes: 2048,
      },
    ],
  });

  invariant(result.error);

  expect(result.error.issues).toPartiallyContain({ path: ['records', 0, 'status'] });
});

test('it rejects a record without its failure reason', () => {
  const result = jevReportSchema.safeParse({
    variant: 'baseline',
    model: 'jev-1.13.0',
    threshold: 0.8,
    samplesPerCase: 3,
    requestsSent: 6,
    policyHash: 'p',
    guidanceHash: null,
    configuredRulesHash: 'c',
    corpusHash: 'h',
    records: [
      {
        case: 'real-01',
        sample: 1,
        status: 'ask',
        rule: 'Data Exfiltration',
        ruleCount: 12,
        contributors: [
          {
            rule: 'Data Exfiltration',
            tier: 'hard',
            choice: 'allow',
            confidence: 0.5,
            allow: 0.5,
            block: 0.3,
            ask: 0.2,
          },
        ],
        elapsedMs: 812,
        requestBytes: 2048,
      },
    ],
  });

  invariant(result.error);

  expect(result.error.issues).toPartiallyContain({ path: ['records', 0, 'failureReason'] });
});

test('it rejects a record without its rule', () => {
  const result = jevReportSchema.safeParse({
    variant: 'baseline',
    model: 'jev-1.13.0',
    threshold: 0.8,
    samplesPerCase: 3,
    requestsSent: 6,
    policyHash: 'p',
    guidanceHash: null,
    configuredRulesHash: 'c',
    corpusHash: 'h',
    records: [
      {
        case: 'real-01',
        sample: 1,
        status: 'ask',
        failureReason: null,
        ruleCount: 12,
        contributors: [
          {
            rule: 'Data Exfiltration',
            tier: 'hard',
            choice: 'allow',
            confidence: 0.5,
            allow: 0.5,
            block: 0.3,
            ask: 0.2,
          },
        ],
        elapsedMs: 812,
        requestBytes: 2048,
      },
    ],
  });

  invariant(result.error);

  expect(result.error.issues).toPartiallyContain({ path: ['records', 0, 'rule'] });
});

test('it rejects a rule count that is not whole', () => {
  const result = jevReportSchema.safeParse({
    variant: 'baseline',
    model: 'jev-1.13.0',
    threshold: 0.8,
    samplesPerCase: 3,
    requestsSent: 6,
    policyHash: 'p',
    guidanceHash: null,
    configuredRulesHash: 'c',
    corpusHash: 'h',
    records: [
      {
        case: 'real-01',
        sample: 1,
        status: 'ask',
        failureReason: null,
        rule: 'Data Exfiltration',
        ruleCount: 12.5,
        contributors: [
          {
            rule: 'Data Exfiltration',
            tier: 'hard',
            choice: 'allow',
            confidence: 0.5,
            allow: 0.5,
            block: 0.3,
            ask: 0.2,
          },
        ],
        elapsedMs: 812,
        requestBytes: 2048,
      },
    ],
  });

  invariant(result.error);

  expect(result.error.issues).toPartiallyContain({ path: ['records', 0, 'ruleCount'] });
});

test('it rejects an elapsed time that is not whole', () => {
  const result = jevReportSchema.safeParse({
    variant: 'baseline',
    model: 'jev-1.13.0',
    threshold: 0.8,
    samplesPerCase: 3,
    requestsSent: 6,
    policyHash: 'p',
    guidanceHash: null,
    configuredRulesHash: 'c',
    corpusHash: 'h',
    records: [
      {
        case: 'real-01',
        sample: 1,
        status: 'ask',
        failureReason: null,
        rule: 'Data Exfiltration',
        ruleCount: 12,
        contributors: [
          {
            rule: 'Data Exfiltration',
            tier: 'hard',
            choice: 'allow',
            confidence: 0.5,
            allow: 0.5,
            block: 0.3,
            ask: 0.2,
          },
        ],
        elapsedMs: 812.5,
        requestBytes: 2048,
      },
    ],
  });

  invariant(result.error);

  expect(result.error.issues).toPartiallyContain({ path: ['records', 0, 'elapsedMs'] });
});

test('it rejects a request size that is not whole', () => {
  const result = jevReportSchema.safeParse({
    variant: 'baseline',
    model: 'jev-1.13.0',
    threshold: 0.8,
    samplesPerCase: 3,
    requestsSent: 6,
    policyHash: 'p',
    guidanceHash: null,
    configuredRulesHash: 'c',
    corpusHash: 'h',
    records: [
      {
        case: 'real-01',
        sample: 1,
        status: 'ask',
        failureReason: null,
        rule: 'Data Exfiltration',
        ruleCount: 12,
        contributors: [
          {
            rule: 'Data Exfiltration',
            tier: 'hard',
            choice: 'allow',
            confidence: 0.5,
            allow: 0.5,
            block: 0.3,
            ask: 0.2,
          },
        ],
        elapsedMs: 812,
        requestBytes: 2048.5,
      },
    ],
  });

  invariant(result.error);

  expect(result.error.issues).toPartiallyContain({ path: ['records', 0, 'requestBytes'] });
});

test('it rejects a contributor without its rule', () => {
  const result = jevReportSchema.safeParse({
    variant: 'baseline',
    model: 'jev-1.13.0',
    threshold: 0.8,
    samplesPerCase: 3,
    requestsSent: 6,
    policyHash: 'p',
    guidanceHash: null,
    configuredRulesHash: 'c',
    corpusHash: 'h',
    records: [
      {
        case: 'real-01',
        sample: 1,
        status: 'ask',
        failureReason: null,
        rule: 'Data Exfiltration',
        ruleCount: 12,
        contributors: [
          {
            tier: 'hard',
            choice: 'allow',
            confidence: 0.5,
            allow: 0.5,
            block: 0.3,
            ask: 0.2,
          },
        ],
        elapsedMs: 812,
        requestBytes: 2048,
      },
    ],
  });

  invariant(result.error);

  expect(result.error.issues).toPartiallyContain({
    path: ['records', 0, 'contributors', 0, 'rule'],
  });
});

test('it rejects a contributor tier other than hard or soft', () => {
  const result = jevReportSchema.safeParse({
    variant: 'baseline',
    model: 'jev-1.13.0',
    threshold: 0.8,
    samplesPerCase: 3,
    requestsSent: 6,
    policyHash: 'p',
    guidanceHash: null,
    configuredRulesHash: 'c',
    corpusHash: 'h',
    records: [
      {
        case: 'real-01',
        sample: 1,
        status: 'ask',
        failureReason: null,
        rule: 'Data Exfiltration',
        ruleCount: 12,
        contributors: [
          {
            rule: 'Data Exfiltration',
            tier: 'medium',
            choice: 'allow',
            confidence: 0.5,
            allow: 0.5,
            block: 0.3,
            ask: 0.2,
          },
        ],
        elapsedMs: 812,
        requestBytes: 2048,
      },
    ],
  });

  invariant(result.error);

  expect(result.error.issues).toPartiallyContain({
    path: ['records', 0, 'contributors', 0, 'tier'],
  });
});

test('it rejects a contributor choice other than allow, block or ask', () => {
  const result = jevReportSchema.safeParse({
    variant: 'baseline',
    model: 'jev-1.13.0',
    threshold: 0.8,
    samplesPerCase: 3,
    requestsSent: 6,
    policyHash: 'p',
    guidanceHash: null,
    configuredRulesHash: 'c',
    corpusHash: 'h',
    records: [
      {
        case: 'real-01',
        sample: 1,
        status: 'ask',
        failureReason: null,
        rule: 'Data Exfiltration',
        ruleCount: 12,
        contributors: [
          {
            rule: 'Data Exfiltration',
            tier: 'hard',
            choice: 'deny',
            confidence: 0.5,
            allow: 0.5,
            block: 0.3,
            ask: 0.2,
          },
        ],
        elapsedMs: 812,
        requestBytes: 2048,
      },
    ],
  });

  invariant(result.error);

  expect(result.error.issues).toPartiallyContain({
    path: ['records', 0, 'contributors', 0, 'choice'],
  });
});

test('it rejects a contributor confidence above 1', () => {
  const result = jevReportSchema.safeParse({
    variant: 'baseline',
    model: 'jev-1.13.0',
    threshold: 0.8,
    samplesPerCase: 3,
    requestsSent: 6,
    policyHash: 'p',
    guidanceHash: null,
    configuredRulesHash: 'c',
    corpusHash: 'h',
    records: [
      {
        case: 'real-01',
        sample: 1,
        status: 'ask',
        failureReason: null,
        rule: 'Data Exfiltration',
        ruleCount: 12,
        contributors: [
          {
            rule: 'Data Exfiltration',
            tier: 'hard',
            choice: 'allow',
            confidence: 1.5,
            allow: 0.5,
            block: 0.3,
            ask: 0.2,
          },
        ],
        elapsedMs: 812,
        requestBytes: 2048,
      },
    ],
  });

  invariant(result.error);

  expect(result.error.issues).toPartiallyContain({
    path: ['records', 0, 'contributors', 0, 'confidence'],
  });
});

test('it rejects a contributor allow probability below 0', () => {
  const result = jevReportSchema.safeParse({
    variant: 'baseline',
    model: 'jev-1.13.0',
    threshold: 0.8,
    samplesPerCase: 3,
    requestsSent: 6,
    policyHash: 'p',
    guidanceHash: null,
    configuredRulesHash: 'c',
    corpusHash: 'h',
    records: [
      {
        case: 'real-01',
        sample: 1,
        status: 'ask',
        failureReason: null,
        rule: 'Data Exfiltration',
        ruleCount: 12,
        contributors: [
          {
            rule: 'Data Exfiltration',
            tier: 'hard',
            choice: 'allow',
            confidence: 0.5,
            allow: -0.1,
            block: 0.3,
            ask: 0.2,
          },
        ],
        elapsedMs: 812,
        requestBytes: 2048,
      },
    ],
  });

  invariant(result.error);

  expect(result.error.issues).toPartiallyContain({
    path: ['records', 0, 'contributors', 0, 'allow'],
  });
});

test('it rejects a contributor block probability above 1', () => {
  const result = jevReportSchema.safeParse({
    variant: 'baseline',
    model: 'jev-1.13.0',
    threshold: 0.8,
    samplesPerCase: 3,
    requestsSent: 6,
    policyHash: 'p',
    guidanceHash: null,
    configuredRulesHash: 'c',
    corpusHash: 'h',
    records: [
      {
        case: 'real-01',
        sample: 1,
        status: 'ask',
        failureReason: null,
        rule: 'Data Exfiltration',
        ruleCount: 12,
        contributors: [
          {
            rule: 'Data Exfiltration',
            tier: 'hard',
            choice: 'allow',
            confidence: 0.5,
            allow: 0.5,
            block: 1.1,
            ask: 0.2,
          },
        ],
        elapsedMs: 812,
        requestBytes: 2048,
      },
    ],
  });

  invariant(result.error);

  expect(result.error.issues).toPartiallyContain({
    path: ['records', 0, 'contributors', 0, 'block'],
  });
});

test('it rejects a contributor ask probability below 0', () => {
  const result = jevReportSchema.safeParse({
    variant: 'baseline',
    model: 'jev-1.13.0',
    threshold: 0.8,
    samplesPerCase: 3,
    requestsSent: 6,
    policyHash: 'p',
    guidanceHash: null,
    configuredRulesHash: 'c',
    corpusHash: 'h',
    records: [
      {
        case: 'real-01',
        sample: 1,
        status: 'ask',
        failureReason: null,
        rule: 'Data Exfiltration',
        ruleCount: 12,
        contributors: [
          {
            rule: 'Data Exfiltration',
            tier: 'hard',
            choice: 'allow',
            confidence: 0.5,
            allow: 0.5,
            block: 0.3,
            ask: -0.2,
          },
        ],
        elapsedMs: 812,
        requestBytes: 2048,
      },
    ],
  });

  invariant(result.error);

  expect(result.error.issues).toPartiallyContain({
    path: ['records', 0, 'contributors', 0, 'ask'],
  });
});
