import { expect, test } from 'bun:test';
import invariant from 'tiny-invariant';
import { answerGuidanceCorpusSchema } from '../../scripts/answer-guidance-corpus-schema.ts';
import { pickEvaluationVerdict } from '../../src/evaluation/pick-evaluation-verdict.ts';
import { buildRecordedDecision } from '../test-utils/build-recorded-decision.ts';
import { answerGuidanceReportSchema } from '../test-utils/corpora/answer-guidance-report-schema.ts';
import { loadCorpus } from '../test-utils/load-corpus.ts';
import { loadShippedRuleTiers } from '../test-utils/load-shipped-rule-tiers.ts';

test.each([
  ['before', 'docs/evaluations/answer-guidance-before.json'],
  ['after', 'docs/evaluations/answer-guidance-after.json'],
])('it records the %s phase on the committed corpus', async (_phase, path) => {
  const [report, corpus] = await Promise.all([
    loadCorpus(path, answerGuidanceReportSchema),
    loadCorpus('fixtures/answer-guidance/cases.json', answerGuidanceCorpusSchema),
  ]);

  expect(report.data.corpusHash).toBe(corpus.hash);
});

test.each([
  ['before', 'docs/evaluations/answer-guidance-before.json'],
  ['after', 'docs/evaluations/answer-guidance-after.json'],
])(
  'it records the 12 corpus cases once each, in corpus order, in the %s phase',
  async (_phase, path) => {
    const [report, corpus] = await Promise.all([
      loadCorpus(path, answerGuidanceReportSchema),
      loadCorpus('fixtures/answer-guidance/cases.json', answerGuidanceCorpusSchema),
    ]);

    expect(report.data.records).toHaveLength(12);

    expect(report.data.records.map((record) => [record.case, record.kind])).toStrictEqual(
      corpus.data.cases.map((entry) => [entry.name, entry.kind]),
    );
  },
);

test.each([
  ['before', 'docs/evaluations/answer-guidance-before.json'],
  ['after', 'docs/evaluations/answer-guidance-after.json'],
])(
  'it runs the %s phase on jev-1.13.0, one sample per case, at the 0.8 threshold',
  async (phase, path) => {
    const report = await loadCorpus(path, answerGuidanceReportSchema);

    expect(report.data).toMatchObject({
      phase,
      model: 'jev-1.13.0',
      threshold: 0.8,
      samplesPerCase: 1,
    });
  },
);

test('it runs both phases on the same policy', async () => {
  const [before, after] = await Promise.all([
    loadCorpus('docs/evaluations/answer-guidance-before.json', answerGuidanceReportSchema),
    loadCorpus('docs/evaluations/answer-guidance-after.json', answerGuidanceReportSchema),
  ]);

  expect(after.data.policyHash).toBe(before.data.policyHash);
});

test('it runs both phases on the same configured rules', async () => {
  const [before, after] = await Promise.all([
    loadCorpus('docs/evaluations/answer-guidance-before.json', answerGuidanceReportSchema),
    loadCorpus('docs/evaluations/answer-guidance-after.json', answerGuidanceReportSchema),
  ]);

  expect(after.data.configuredRulesHash).toBe(before.data.configuredRulesHash);
});

test.each([
  ['before', 'docs/evaluations/answer-guidance-before.json'],
  ['after', 'docs/evaluations/answer-guidance-after.json'],
])(
  'it reproduces every recorded verdict of the %s phase from its recorded answers',
  async (_phase, path) => {
    const [report, tiers] = await Promise.all([
      loadCorpus(path, answerGuidanceReportSchema),
      loadShippedRuleTiers(),
    ]);

    const verdicts = report.data.records.map((record) => {
      const decision = buildRecordedDecision(record.answers, tiers, report.data.model);

      return [record.case, pickEvaluationVerdict(decision.request, decision.result, 0.8).kind];
    });

    expect(Object.fromEntries(verdicts)).toStrictEqual(
      Object.fromEntries(report.data.records.map((record) => [record.case, record.status])),
    );
  },
);

test('it keeps every verdict unchanged between the phases', async () => {
  const [before, after] = await Promise.all([
    loadCorpus('docs/evaluations/answer-guidance-before.json', answerGuidanceReportSchema),
    loadCorpus('docs/evaluations/answer-guidance-after.json', answerGuidanceReportSchema),
  ]);

  expect(
    Object.fromEntries(after.data.records.map((record) => [record.case, record.status])),
  ).toStrictEqual(
    Object.fromEntries(before.data.records.map((record) => [record.case, record.status])),
  );
});

test('it shrinks the request for every case by more than 20,000 bytes', async () => {
  const [before, after] = await Promise.all([
    loadCorpus('docs/evaluations/answer-guidance-before.json', answerGuidanceReportSchema),
    loadCorpus('docs/evaluations/answer-guidance-after.json', answerGuidanceReportSchema),
  ]);

  const saved = before.data.records.map((record, index) => {
    const later = after.data.records[index];

    invariant(later?.case === record.case, 'both phases list the cases in one order');

    return record.requestBytes - later.requestBytes;
  });

  expect(saved).toHaveLength(12);
  expect(saved).toSatisfyAll((bytes: number) => bytes > 20_000);
});

test.each([
  ['before', 'docs/evaluations/answer-guidance-before.json'],
  ['after', 'docs/evaluations/answer-guidance-after.json'],
])('it asks or denies all 6 risky controls in the %s phase', async (_phase, path) => {
  const report = await loadCorpus(path, answerGuidanceReportSchema);

  const statuses = report.data.records
    .filter((record) => record.kind === 'risk')
    .map((record) => record.status);

  expect(statuses).toHaveLength(6);
  expect(statuses).toSatisfyAll((status: string) => status === 'ask' || status === 'deny');
});
