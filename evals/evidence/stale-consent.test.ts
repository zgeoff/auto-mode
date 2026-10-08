import { expect, test } from 'bun:test';
import { staleConsentCorpusSchema } from '../../scripts/stale-consent-corpus-schema.ts';
import { pickEvaluationVerdict } from '../../src/evaluation/pick-evaluation-verdict.ts';
import { buildRecordedDecision } from '../test-utils/build-recorded-decision.ts';
import { staleConsentReportSchema } from '../test-utils/corpora/stale-consent-report-schema.ts';
import { loadCorpus } from '../test-utils/load-corpus.ts';
import { loadShippedRuleTiers } from '../test-utils/load-shipped-rule-tiers.ts';

test('it records the run on the committed corpus', async () => {
  const [report, corpus] = await Promise.all([
    loadCorpus('docs/evaluations/stale-consent.json', staleConsentReportSchema),
    loadCorpus('fixtures/stale-consent/cases.json', staleConsentCorpusSchema),
  ]);

  expect(report.data.corpusHash).toBe(corpus.hash);
});

test('it runs jev-1.13.0 once per arm, without retries, at the 0.8 threshold', async () => {
  const report = await loadCorpus('docs/evaluations/stale-consent.json', staleConsentReportSchema);

  expect(report.data).toMatchObject({
    model: 'jev-1.13.0',
    threshold: 0.8,
    samplesPerCase: 1,
    retries: 0,
  });
});

test('it records every answer from the model of the run', async () => {
  const report = await loadCorpus('docs/evaluations/stale-consent.json', staleConsentReportSchema);

  expect(report.data.records).toHaveLength(12);

  expect(report.data.records.map((record) => record.model)).toSatisfyAll(
    (model: string) => model === report.data.model,
  );
});

test('it records both arms of the 6 corpus pairs in corpus order', async () => {
  const [report, corpus] = await Promise.all([
    loadCorpus('docs/evaluations/stale-consent.json', staleConsentReportSchema),
    loadCorpus('fixtures/stale-consent/cases.json', staleConsentCorpusSchema),
  ]);

  const armOrders = { stale: ['stale', 'null'], null: ['null', 'stale'] };

  expect(report.data.records).toHaveLength(12);

  expect(
    report.data.records.map(
      (record) => `${record.pair} ${record.action} ${record.variant} ${record.arm}`,
    ),
  ).toStrictEqual(
    corpus.data.pairs.flatMap((entry) =>
      armOrders[entry.firstArm].map(
        (arm) => `${entry.pair} ${entry.action} ${entry.variant} ${arm}`,
      ),
    ),
  );
});

test('it sends both arms of each pair with one control request', async () => {
  const report = await loadCorpus('docs/evaluations/stale-consent.json', staleConsentReportSchema);

  const stale = report.data.records.filter((record) => record.arm === 'stale');
  const empty = report.data.records.filter((record) => record.arm === 'null');

  expect(stale.map((record) => [record.pair, record.controlHash])).toIncludeSameMembers(
    empty.map((record) => [record.pair, record.controlHash]),
  );
});

test('it sends the stale arm of each pair as another request than the null arm', async () => {
  const report = await loadCorpus('docs/evaluations/stale-consent.json', staleConsentReportSchema);

  const stale = report.data.records.filter((record) => record.arm === 'stale');
  const empty = report.data.records.filter((record) => record.arm === 'null');

  expect(stale).toHaveLength(6);

  expect(stale.map((record) => [record.pair, record.requestHash])).not.toIncludeAnyMembers(
    empty.map((record) => [record.pair, record.requestHash]),
  );
});

test('it sends the null arm of each pair as the control request', async () => {
  const report = await loadCorpus('docs/evaluations/stale-consent.json', staleConsentReportSchema);

  const empty = report.data.records.filter((record) => record.arm === 'null');

  expect(empty).toHaveLength(6);

  expect(empty.map((record) => record.requestHash)).toStrictEqual(
    empty.map((record) => record.controlHash),
  );
});

test('it reproduces every recorded verdict and deny rule from the recorded answers', async () => {
  const [report, tiers] = await Promise.all([
    loadCorpus('docs/evaluations/stale-consent.json', staleConsentReportSchema),
    loadShippedRuleTiers(),
  ]);

  const verdicts = report.data.records.map((record) => {
    const decision = buildRecordedDecision(record.answers, tiers, record.model);
    const verdict = pickEvaluationVerdict(decision.request, decision.result, 0.8);

    return [`${record.pair} ${record.arm}`, { rule: null, ...verdict }];
  });

  expect(Object.fromEntries(verdicts)).toStrictEqual(
    Object.fromEntries(
      report.data.records.map((record) => [
        `${record.pair} ${record.arm}`,
        { kind: record.status, rule: record.rule },
      ]),
    ),
  );
});
