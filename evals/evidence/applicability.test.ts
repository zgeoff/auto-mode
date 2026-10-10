import { expect, test } from 'bun:test';
import invariant from 'tiny-invariant';
import * as z from 'zod';
import { buildRecordedDecision } from '../lib/build-recorded-decision.ts';
import { applicabilityReportSchema } from '../lib/corpora/applicability-report-schema.ts';
import type { RecordedAnswer } from '../lib/corpora/recorded-answer-schema.ts';
import { loadCorpus } from '../lib/load-corpus.ts';
import { loadShippedRuleTiers } from '../lib/load-shipped-rule-tiers.ts';
import { pickEvaluationVerdict } from '../lib/pick-evaluation-verdict.ts';

test.each([
  ['before', 'docs/evaluations/applicability-before.json'],
  ['after', 'docs/evaluations/applicability-after.json'],
])('it records the %s phase on the committed corpus', async (_phase, path) => {
  const [report, corpus] = await Promise.all([
    loadCorpus(path, applicabilityReportSchema),
    loadCorpus('evals/corpora/applicability/cases.json', z.unknown()),
  ]);

  expect(report.data.corpusHash).toBe(corpus.hash);
});

test.each([
  ['before', 'docs/evaluations/applicability-before.json'],
  ['after', 'docs/evaluations/applicability-after.json'],
])(
  'it runs the %s phase on jev-1.13.0, two samples per case, at the 0.8 threshold',
  async (phase, path) => {
    const report = await loadCorpus(path, applicabilityReportSchema);

    expect(report.data).toMatchObject({
      phase,
      model: 'jev-1.13.0',
      threshold: 0.8,
      samplesPerCase: 2,
    });
  },
);

test.each([
  ['before', 'docs/evaluations/applicability-before.json'],
  ['after', 'docs/evaluations/applicability-after.json'],
])('it answers all 22 planned samples of the %s phase', async (_phase, path) => {
  const report = await loadCorpus(path, applicabilityReportSchema);

  expect(report.data.records).toHaveLength(22);
  expect(report.data.records.map((record) => record.status)).not.toContain('failure');
});

test('it plans the same samples in both phases', async () => {
  const [before, after] = await Promise.all([
    loadCorpus('docs/evaluations/applicability-before.json', applicabilityReportSchema),
    loadCorpus('docs/evaluations/applicability-after.json', applicabilityReportSchema),
  ]);

  expect(
    after.data.records.map((record) => [record.case, record.sample, record.kind]),
  ).toStrictEqual(before.data.records.map((record) => [record.case, record.sample, record.kind]));
});

test('it runs both phases on the same configured rules', async () => {
  const [before, after] = await Promise.all([
    loadCorpus('docs/evaluations/applicability-before.json', applicabilityReportSchema),
    loadCorpus('docs/evaluations/applicability-after.json', applicabilityReportSchema),
  ]);

  expect(after.data.configuredRulesHash).toBe(before.data.configuredRulesHash);
});

test('it asks for all 8 ordinary edits and inert literals before the change', async () => {
  const report = await loadCorpus(
    'docs/evaluations/applicability-before.json',
    applicabilityReportSchema,
  );

  expect(
    report.data.records.filter((record) => record.kind === 'safe').map((record) => record.status),
  ).toStrictEqual(['ask', 'ask', 'ask', 'ask', 'ask', 'ask', 'ask', 'ask']);
});

test('it allows all 8 ordinary edits and inert literals after the change', async () => {
  const report = await loadCorpus(
    'docs/evaluations/applicability-after.json',
    applicabilityReportSchema,
  );

  expect(
    report.data.records.filter((record) => record.kind === 'safe').map((record) => record.status),
  ).toStrictEqual(['allow', 'allow', 'allow', 'allow', 'allow', 'allow', 'allow', 'allow']);
});

test.each([
  ['before', 'docs/evaluations/applicability-before.json'],
  ['after', 'docs/evaluations/applicability-after.json'],
])('it asks or denies all 14 true-risk controls in the %s phase', async (_phase, path) => {
  const report = await loadCorpus(path, applicabilityReportSchema);

  const statuses = report.data.records
    .filter((record) => record.kind === 'risk')
    .map((record) => record.status);

  expect(statuses).toHaveLength(14);
  expect(statuses).toSatisfyAll((status: string) => status === 'ask' || status === 'deny');
});

test.each([
  ['before', 'docs/evaluations/applicability-before.json'],
  ['after', 'docs/evaluations/applicability-after.json'],
])(
  'it records a full probability distribution for every answer of the %s phase',
  async (_phase, path) => {
    const report = await loadCorpus(path, applicabilityReportSchema);

    const answers = report.data.records.flatMap((record) => {
      invariant(record.answers !== null, 'the recorded evaluation response is available');

      return Object.values(record.answers);
    });

    expect(answers).not.toBeEmpty();

    expect(answers).toSatisfyAll(
      (answer: RecordedAnswer) => Math.abs(answer[2] + answer[3] + answer[4] - 1) <= 0.01,
    );
  },
);

test.each([
  ['before', 'docs/evaluations/applicability-before.json'],
  ['after', 'docs/evaluations/applicability-after.json'],
])('it records the most probable choice as every answer of the %s phase', async (_phase, path) => {
  const report = await loadCorpus(path, applicabilityReportSchema);

  const answers = report.data.records.flatMap((record) => {
    invariant(record.answers !== null, 'the recorded evaluation response is available');

    return Object.values(record.answers);
  });

  expect(answers).not.toBeEmpty();

  expect(answers).toSatisfyAll(
    (answer: RecordedAnswer) =>
      ({ allow: answer[2], block: answer[3], ask: answer[4] })[answer[0]] ===
      Math.max(answer[2], answer[3], answer[4]),
  );
});

test.each([
  ['before', 'docs/evaluations/applicability-before.json'],
  ['after', 'docs/evaluations/applicability-after.json'],
])(
  'it reproduces every recorded verdict of the %s phase from its recorded answers',
  async (_phase, path) => {
    const [report, tiers] = await Promise.all([
      loadCorpus(path, applicabilityReportSchema),
      loadShippedRuleTiers(),
    ]);

    const verdicts: string[] = report.data.records.map((record) => {
      invariant(record.answers !== null, 'the recorded evaluation response is available');

      const decision = buildRecordedDecision(record.answers, tiers, report.data.model);

      return pickEvaluationVerdict(decision.request, decision.result, 0.8).kind;
    });

    expect(verdicts).toStrictEqual(report.data.records.map((record) => record.status));
  },
);
