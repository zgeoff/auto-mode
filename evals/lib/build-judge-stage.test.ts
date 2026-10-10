import { expect, test } from 'bun:test';
import invariant from 'tiny-invariant';
import { buildJudgeStage } from './build-judge-stage.ts';
import type { JudgeRequest } from './define-experiment.ts';
import { buildMockJevContributor } from './factories/build-mock-jev-contributor.ts';
import { buildMockJevRecord } from './factories/build-mock-jev-record.ts';
import { buildMockJudgeRecord } from './factories/build-mock-judge-record.ts';
import { buildMockMeasurementCase } from './factories/build-mock-measurement-case.ts';
import { buildMockSampleRecord } from './factories/build-mock-sample-record.ts';
import { buildMockStageContext } from './factories/build-mock-stage-context.ts';

test('it reviews the Jev stage when it judges only Jev denies', () => {
  expect(buildJudgeStage({ scope: 'jev-denies', replaysRecording: true }).reviews).toBe('jev');
});

test('it reviews no stage when it judges every sample', () => {
  expect(
    buildJudgeStage({ scope: 'every-sample', replaysRecording: true }).reviews,
  ).toBeUndefined();
});

test('it has no replay when it replays no recording', () => {
  expect(buildJudgeStage({ scope: 'jev-denies', replaysRecording: false }).replay).toBeUndefined();
});

test('it skips a sample Jev allowed without sending', async () => {
  const labels = { severity: 'safe', consent: 'none', source: 'synthetic' } as const;
  const previous = [buildMockSampleRecord({ stage: 'jev', verdict: 'allow' })];

  const outcome = await buildJudgeStage({ scope: 'jev-denies', replaysRecording: false }).run(
    { key: 'set/a', labels, case: buildMockMeasurementCase() },
    buildMockStageContext({ offline: false, previous }),
  );

  expect(outcome).toStrictEqual({ status: 'skipped', reason: 'Jev did not deny this sample.' });
});

test('it skips a Jev deny another stage denied first, so a containment deny stays final', async () => {
  const labels = { severity: 'safe', consent: 'none', source: 'synthetic' } as const;

  const previous = [
    buildMockSampleRecord({ stage: 'containment', verdict: 'deny' }),
    buildMockSampleRecord({ stage: 'jev', verdict: 'deny' }),
  ];

  const outcome = await buildJudgeStage({ scope: 'jev-denies', replaysRecording: false }).run(
    { key: 'set/a', labels, case: buildMockMeasurementCase() },
    buildMockStageContext({ offline: false, previous }),
  );

  expect(outcome).toStrictEqual({
    status: 'skipped',
    reason: 'The containment stage denied this sample first.',
  });
});

test('it sends a Jev deny with the case message and overturns it on an explicit allow', async () => {
  const sent: JudgeRequest[] = [];
  const labels = { severity: 'safe', consent: 'none', source: 'synthetic' } as const;
  const measurementCase = buildMockMeasurementCase({ lastUserMessage: 'go ahead' });
  const previous = [buildMockSampleRecord({ stage: 'jev', verdict: 'deny' })];

  const context = buildMockStageContext({
    offline: false,
    previous,
    sendJudge: (request) => {
      sent.push(request);

      return Promise.resolve({ model: 'judge', text: '<block>no</block>' });
    },
  });

  const outcome = await buildJudgeStage({ scope: 'jev-denies', replaysRecording: false }).run(
    { key: 'set/a', labels, case: measurementCase },
    context,
  );

  expect(outcome).toStrictEqual({ status: 'scored', verdict: 'allow', pBlock: null, reason: null });

  expect(sent).toStrictEqual([
    {
      action: measurementCase.action,
      lastUserMessage: 'go ahead',
      repository: measurementCase.repository,
    },
  ]);
});

test('it judges every sample without a Jev deny when it judges every sample', async () => {
  const labels = { severity: 'safe', consent: 'none', source: 'synthetic' } as const;

  const context = buildMockStageContext({
    offline: false,
    sendJudge: () =>
      Promise.resolve({
        model: 'judge',
        text: '<block>yes</block><rule>Data Exfiltration</rule>',
      }),
  });

  const outcome = await buildJudgeStage({ scope: 'every-sample', replaysRecording: false }).run(
    { key: 'set/a', labels, case: buildMockMeasurementCase() },
    context,
  );

  expect(outcome).toStrictEqual({
    status: 'scored',
    verdict: 'deny',
    pBlock: null,
    reason: 'Data Exfiltration',
  });
});

test('it fails closed on an unreadable judge reply', async () => {
  const labels = { severity: 'safe', consent: 'none', source: 'synthetic' } as const;

  const context = buildMockStageContext({
    offline: false,
    sendJudge: () => Promise.resolve({ model: 'judge', text: 'probably fine' }),
  });

  const outcome = await buildJudgeStage({ scope: 'every-sample', replaysRecording: false }).run(
    { key: 'set/a', labels, case: buildMockMeasurementCase() },
    context,
  );

  expect(outcome).toStrictEqual({ status: 'not-scorable', reason: 'judge-unreadable' });
});

test('it leaves a failed judge request for the run to record, never reading it as an allow', () => {
  const labels = { severity: 'safe', consent: 'none', source: 'synthetic' } as const;

  const context = buildMockStageContext({
    offline: false,
    sendJudge: () => Promise.reject(new Error('The judge transport refused the request.')),
  });

  expect(
    buildJudgeStage({ scope: 'every-sample', replaysRecording: false }).run(
      { key: 'set/a', labels, case: buildMockMeasurementCase() },
      context,
    ),
  ).rejects.toThrowWithMessage(Error, 'The judge transport refused the request.');
});

test('it replays a recorded block on a recorded ask whose every answer chose allow', async () => {
  const labels = { severity: 'safe', consent: 'none', source: 'recorded' } as const;
  const contributor = buildMockJevContributor({ tier: 'soft', choice: 'allow', confidence: 0.4 });
  const jev = buildMockJevRecord({ status: 'ask', contributors: [contributor] });

  const judge = buildMockJudgeRecord({
    verdict: 'block',
    rule: 'Data Exfiltration',
    elapsedMs: 9000,
  });

  const measurementCase = buildMockMeasurementCase({
    recorded: {
      jev: { 0: { kind: 'jev-record', record: jev, model: 'jev-model' } },
      judge: { 0: { kind: 'judge', record: judge, model: 'judge-model' } },
    },
  });

  const previous = [buildMockSampleRecord({ stage: 'jev', verdict: 'deny' })];
  const stage = buildJudgeStage({ scope: 'jev-denies', replaysRecording: true });

  invariant(stage.replay);

  const outcome = await stage.replay(
    { key: 'set/a', labels, case: measurementCase },
    buildMockStageContext({ previous }),
  );

  expect(outcome).toStrictEqual({
    status: 'scored',
    verdict: 'deny',
    pBlock: null,
    reason: 'Data Exfiltration',
    recorded: { answer: judge, latencyMs: 9000, model: 'judge-model' },
  });
});

test('it skips a recorded Jev deny the recorded judge never saw', async () => {
  const labels = { severity: 'safe', consent: 'none', source: 'recorded' } as const;
  const jev = buildMockJevRecord({ status: 'deny', rule: 'Data Exfiltration' });

  const measurementCase = buildMockMeasurementCase({
    recorded: { jev: { 0: { kind: 'jev-record', record: jev, model: 'jev-model' } } },
  });

  const previous = [buildMockSampleRecord({ stage: 'jev', verdict: 'deny' })];
  const stage = buildJudgeStage({ scope: 'jev-denies', replaysRecording: true });

  invariant(stage.replay);

  const outcome = await stage.replay(
    { key: 'set/a', labels, case: measurementCase },
    buildMockStageContext({ previous }),
  );

  expect(outcome).toStrictEqual({
    status: 'skipped',
    reason: 'The recording judged only asks whose every answer chose allow.',
  });
});

test('it replays a failed recorded judge request as not scorable with its reason', async () => {
  const labels = { severity: 'safe', consent: 'none', source: 'recorded' } as const;

  const judge = buildMockJudgeRecord({
    verdict: 'failure',
    failureReason: 'timeout',
    elapsedMs: 60_000,
  });

  const measurementCase = buildMockMeasurementCase({
    recorded: { judge: { 0: { kind: 'judge', record: judge, model: 'judge-model' } } },
  });

  const stage = buildJudgeStage({ scope: 'every-sample', replaysRecording: true });

  invariant(stage.replay);

  const outcome = await stage.replay(
    { key: 'set/a', labels, case: measurementCase },
    buildMockStageContext(),
  );

  expect(outcome).toStrictEqual({
    status: 'not-scorable',
    reason: 'judge-timeout',
    recorded: { answer: judge, latencyMs: 60_000, model: 'judge-model' },
  });
});
