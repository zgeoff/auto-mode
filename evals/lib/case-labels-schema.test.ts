import { expect, test } from 'bun:test';
import type * as z from 'zod';
import { caseLabelsSchema } from './case-labels-schema.ts';

test('it accepts labels for a catastrophic and a safe case', () => {
  const labels: z.input<typeof caseLabelsSchema> = {
    schemaVersion: 1,
    corpus: 'question-severity',
    key: 'id',
    cases: {
      C10: {
        severity: 'catastrophic',
        harm: 'main-or-production-write',
        consent: 'none',
        source: 'synthetic',
      },
      R1: { severity: 'safe', consent: 'asked', source: 'recorded', note: 'The user named it.' },
    },
  };

  expect(caseLabelsSchema.safeParse(labels).data).toStrictEqual(labels);
});

test('it rejects a catastrophic case without a harm', () => {
  const result = caseLabelsSchema.safeParse({
    schemaVersion: 1,
    corpus: 'question-severity',
    key: 'id',
    cases: { C10: { severity: 'catastrophic', consent: 'none', source: 'synthetic' } },
  });

  expect(result.error?.issues).toPartiallyContain({ path: ['cases', 'C10', 'harm'] });
});

test('it rejects a harm on a tolerable case', () => {
  const result = caseLabelsSchema.safeParse({
    schemaVersion: 1,
    corpus: 'question-severity',
    key: 'id',
    cases: {
      P1: {
        severity: 'tolerable',
        harm: 'lost-unowned-work',
        consent: 'none',
        source: 'synthetic',
      },
    },
  });

  expect(result.error?.issues).toPartiallyContain({
    code: 'unrecognized_keys',
    path: ['cases', 'P1'],
  });
});

test('it rejects a harm outside the five catastrophic outcomes', () => {
  const result = caseLabelsSchema.safeParse({
    schemaVersion: 1,
    corpus: 'question-severity',
    key: 'id',
    cases: {
      C10: {
        severity: 'catastrophic',
        harm: 'mass-modification',
        consent: 'none',
        source: 'synthetic',
      },
    },
  });

  expect(result.error?.issues).toPartiallyContain({ path: ['cases', 'C10', 'harm'] });
});

test('it rejects a consent outside none, asked and near-miss', () => {
  const result = caseLabelsSchema.safeParse({
    schemaVersion: 1,
    corpus: 'question-severity',
    key: 'id',
    cases: { R1: { severity: 'safe', consent: 'stale', source: 'recorded' } },
  });

  expect(result.error?.issues).toPartiallyContain({ path: ['cases', 'R1', 'consent'] });
});

test('it rejects a schema version other than 1', () => {
  const result = caseLabelsSchema.safeParse({
    schemaVersion: 2,
    corpus: 'question-severity',
    key: 'id',
    cases: { R1: { severity: 'safe', consent: 'none', source: 'recorded' } },
  });

  expect(result.error?.issues).toPartiallyContain({ path: ['schemaVersion'] });
});

test('it rejects a note longer than 200 characters', () => {
  const result = caseLabelsSchema.safeParse({
    schemaVersion: 1,
    corpus: 'question-severity',
    key: 'id',
    cases: { R1: { severity: 'safe', consent: 'none', source: 'recorded', note: 'x'.repeat(201) } },
  });

  expect(result.error?.issues).toPartiallyContain({ path: ['cases', 'R1', 'note'] });
});
