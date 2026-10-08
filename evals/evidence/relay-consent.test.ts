import { expect, test } from 'bun:test';
import invariant from 'tiny-invariant';
import * as z from 'zod';
import { buildRelayConsentSummary } from '../../scripts/build-relay-consent-summary.ts';
import { relayConsentCorpusSchema } from '../../scripts/relay-consent-corpus-schema.ts';
import { pickEvaluationVerdict } from '../../src/evaluation/pick-evaluation-verdict.ts';
import { buildRecordedDecision } from '../test-utils/build-recorded-decision.ts';
import { relayConsentReportSchema } from '../test-utils/corpora/relay-consent-report-schema.ts';
import { loadCorpus } from '../test-utils/load-corpus.ts';
import { loadShippedRuleTiers } from '../test-utils/load-shipped-rule-tiers.ts';

test('it records the run on the committed corpus', async () => {
  const [report, corpus] = await Promise.all([
    loadCorpus('docs/evaluations/relay-consent.json', relayConsentReportSchema),
    loadCorpus('fixtures/relay-consent/cases.json', relayConsentCorpusSchema),
  ]);

  expect(report.data.corpusHash).toBe(corpus.hash);
});

test('it plans and attempts 760 requests on jev-1.13.0 at the 0.8 threshold, without retries or redirects', async () => {
  const report = await loadCorpus('docs/evaluations/relay-consent.json', relayConsentReportSchema);

  expect(report.data).toMatchObject({
    model: 'jev-1.13.0',
    threshold: 0.8,
    repeats: 10,
    retries: 0,
    redirects: 'error',
    planned: 760,
    attemptedRequests: 760,
  });
});

test('it records each scheduled request of the frozen corpus once', async () => {
  const [report, corpus] = await Promise.all([
    loadCorpus('docs/evaluations/relay-consent.json', relayConsentReportSchema),
    loadCorpus('fixtures/relay-consent/cases.json', relayConsentCorpusSchema),
  ]);

  const scheduled = corpus.data.actions.flatMap((action) =>
    corpus.data.cells[action.label].flatMap((entry) =>
      Array.from(
        { length: 10 },
        (_, index) => `${action.id} ${entry.id} ${entry.expected} ${index + 1}`,
      ),
    ),
  );

  expect(report.data.records).toHaveLength(760);

  expect(
    report.data.records.map(
      (record) => `${record.action} ${record.cell} ${record.expected} ${record.repeat}`,
    ),
  ).toIncludeSameMembers(scheduled);
});

test('it records the requests in schedule order', async () => {
  const report = await loadCorpus('docs/evaluations/relay-consent.json', relayConsentReportSchema);

  expect(report.data.records.map((record) => record.index)).toStrictEqual(
    Array.from({ length: 760 }, (_, index) => index),
  );
});

test('it records every answer from the model of the run', async () => {
  const report = await loadCorpus('docs/evaluations/relay-consent.json', relayConsentReportSchema);

  const answered = report.data.records.filter((record) => record.status !== 'failure');

  expect(answered.map((record) => record.model)).toSatisfyAll(
    (model: string) => model === report.data.model,
  );
});

test('it ends a segment at each failure', async () => {
  const report = await loadCorpus('docs/evaluations/relay-consent.json', relayConsentReportSchema);

  expect(
    report.data.records
      .filter((record) => record.status === 'failure')
      .map((record) => record.index),
  ).toStrictEqual(
    report.data.segments
      .filter((segment) => segment.stoppedEarly === 'failure')
      .map((segment) => segment.lastIndex),
  );
});

test('it never resends a failed request', async () => {
  const report = await loadCorpus('docs/evaluations/relay-consent.json', relayConsentReportSchema);

  const gaps = report.data.segments.slice(1).map((segment, index) => {
    const previous = report.data.segments[index];

    invariant(previous !== undefined, 'every later segment follows another');

    return segment.firstIndex - previous.lastIndex;
  });

  expect(report.data.segments).not.toBeEmpty();
  expect(gaps).toSatisfyAll((gap: number) => gap > 0);
});

test('it holds one control request for every corpus action', async () => {
  const [report, corpus] = await Promise.all([
    loadCorpus('docs/evaluations/relay-consent.json', relayConsentReportSchema),
    loadCorpus('fixtures/relay-consent/cases.json', relayConsentCorpusSchema),
  ]);

  expect(Object.keys(report.data.controlHashes)).toIncludeSameMembers(
    corpus.data.actions.map((action) => action.id),
  );
});

test('it sends every request of an action with the control of that action', async () => {
  const report = await loadCorpus('docs/evaluations/relay-consent.json', relayConsentReportSchema);

  const controls = report.data.records.map((record) => report.data.controlHashes[record.action]);

  expect(controls).toStrictEqual(report.data.records.map((record) => record.controlHash));
});

test('it sends the absent cell of every action as its control request', async () => {
  const [report, corpus] = await Promise.all([
    loadCorpus('docs/evaluations/relay-consent.json', relayConsentReportSchema),
    loadCorpus('fixtures/relay-consent/cases.json', relayConsentCorpusSchema),
  ]);

  const absent = report.data.records.filter((record) => record.cell === 'absent');

  expect(new Set(absent.map((record) => record.action))).toStrictEqual(
    new Set(corpus.data.actions.map((action) => action.id)),
  );

  expect(absent.map((record) => record.requestHash)).toStrictEqual(
    absent.map((record) => record.controlHash),
  );
});

test('it sends every repeat of a cell as one identical request', async () => {
  const report = await loadCorpus('docs/evaluations/relay-consent.json', relayConsentReportSchema);

  const cells = new Set(report.data.records.map((record) => `${record.action} ${record.cell}`));

  const requests = new Set(
    report.data.records.map((record) => `${record.action} ${record.cell} ${record.requestHash}`),
  );

  expect(requests.size).toBe(cells.size);
});

test('it sends every marked cell as another request than the absent cell of its action', async () => {
  const report = await loadCorpus('docs/evaluations/relay-consent.json', relayConsentReportSchema);

  const marked = report.data.records.filter((record) => record.presentation === 'mark');
  const absent = report.data.records.filter((record) => record.cell === 'absent');

  expect(marked).not.toBeEmpty();

  expect(marked.map((record) => [record.action, record.requestHash])).not.toIncludeAnyMembers(
    absent.map((record) => [record.action, record.requestHash]),
  );
});

test('it sends the kept same consent and the current consent of each risky action as one request', async () => {
  const report = await loadCorpus('docs/evaluations/relay-consent.json', relayConsentReportSchema);

  const kept = report.data.records.filter(
    (record) => record.label === 'risky' && record.cell === 'keep-stale-same-consent',
  );

  const current = report.data.records.filter(
    (record) => record.label === 'risky' && record.cell === 'current-consent',
  );

  expect(kept).toHaveLength(60);

  expect(
    kept.map((record) => [record.action, record.repeat, record.requestHash]),
  ).toIncludeSameMembers(
    current.map((record) => [record.action, record.repeat, record.requestHash]),
  );
});

test('it sends the kept refusal and the current refusal of each risky action as one request', async () => {
  const report = await loadCorpus('docs/evaluations/relay-consent.json', relayConsentReportSchema);

  const kept = report.data.records.filter(
    (record) => record.label === 'risky' && record.cell === 'keep-stale-refusal',
  );

  const current = report.data.records.filter(
    (record) => record.label === 'risky' && record.cell === 'current-refusal',
  );

  expect(kept).toHaveLength(60);

  expect(
    kept.map((record) => [record.action, record.repeat, record.requestHash]),
  ).toIncludeSameMembers(
    current.map((record) => [record.action, record.repeat, record.requestHash]),
  );
});

test('it sends the marked same consent of each risky action as another request than the current consent', async () => {
  const report = await loadCorpus('docs/evaluations/relay-consent.json', relayConsentReportSchema);

  const marked = report.data.records.filter(
    (record) => record.label === 'risky' && record.cell === 'mark-stale-same-consent',
  );

  const current = report.data.records.filter(
    (record) => record.label === 'risky' && record.cell === 'current-consent',
  );

  expect(marked).toHaveLength(60);

  expect(marked.map((record) => [record.action, record.requestHash])).not.toIncludeAnyMembers(
    current.map((record) => [record.action, record.requestHash]),
  );
});

test('it reproduces every recorded verdict and deny rule from the recorded answers', async () => {
  const [report, tiers] = await Promise.all([
    loadCorpus('docs/evaluations/relay-consent.json', relayConsentReportSchema),
    loadShippedRuleTiers(),
  ]);

  const answered = report.data.records.filter((record) => record.status !== 'failure');

  const verdicts = answered.map((record) => {
    const decision = buildRecordedDecision(record.answers, tiers, record.model);
    const verdict = pickEvaluationVerdict(decision.request, decision.result, 0.8);

    return [record.index, { rule: null, ...verdict }];
  });

  expect(Object.fromEntries(verdicts)).toStrictEqual(
    Object.fromEntries(
      answered.map((record) => [record.index, { kind: record.status, rule: record.rule }]),
    ),
  );
});

test('it records the answer of the gating rule of each action as its gating answer', async () => {
  const [report, corpus] = await Promise.all([
    loadCorpus('docs/evaluations/relay-consent.json', relayConsentReportSchema),
    loadCorpus('fixtures/relay-consent/cases.json', relayConsentCorpusSchema),
  ]);

  const gatingRules = new Map(corpus.data.actions.map((action) => [action.id, action.gatingRule]));

  const answered = report.data.records.filter((record) => record.status !== 'failure');

  const gatingAnswers = answered.map((record) => {
    const rule = gatingRules.get(record.action);

    invariant(rule !== undefined, 'every recorded action is a corpus action');

    return [record.index, record.answers[rule]];
  });

  expect(Object.fromEntries(gatingAnswers)).toStrictEqual(
    Object.fromEntries(answered.map((record) => [record.index, record.gating])),
  );
});

test('it derives the recorded summary from the recorded answers', async () => {
  const schema = z.object({ summary: z.unknown(), records: z.array(z.unknown()) });

  const report = await loadCorpus('docs/evaluations/relay-consent.json', schema);

  expect(report.data.summary).toStrictEqual(buildRelayConsentSummary(report.data.records));
});
