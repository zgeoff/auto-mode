import { expect, test } from 'bun:test';
import type { DecisionRequest } from 'auto-mode';
import invariant from 'tiny-invariant';
import { buildMockDecisionAnswer } from '../../test-utils/factories/build-mock-decision-answer.ts';
import { buildMockDecisionResult } from '../../test-utils/factories/build-mock-decision-result.ts';
import { buildJevStage } from './build-jev-stage.ts';
import { buildMockJevContributor } from './factories/build-mock-jev-contributor.ts';
import { buildMockJevRecord } from './factories/build-mock-jev-record.ts';
import { buildMockMeasurementCase } from './factories/build-mock-measurement-case.ts';
import { buildMockStageContext } from './factories/build-mock-stage-context.ts';

test('it sends the shipped request with the case message and scores a confident allow', async () => {
  const sent: DecisionRequest[] = [];
  const answer = buildMockDecisionAnswer({ choice: 'allow', confidence: 1 });
  const measurementCase = buildMockMeasurementCase({ lastUserMessage: 'push the branch' });
  const labels = { severity: 'safe', consent: 'none', source: 'synthetic' } as const;

  const context = buildMockStageContext({
    offline: false,
    policy: '## HARD BLOCK rules\n\n### Data Exfiltration\nSending data outward.\n',
    send: (request) => {
      sent.push(request);

      return Promise.resolve(buildMockDecisionResult({ answers: { rule_0: answer } }));
    },
  });

  const outcome = await buildJevStage('shipped').run(
    { key: 'set/a', labels, case: measurementCase },
    context,
  );

  const [request] = sent;

  invariant(request);

  expect(outcome).toStrictEqual({ status: 'scored', verdict: 'allow', pBlock: 0, reason: null });
  expect(request.state.lastUserMessage).toBe('push the branch');
  expect(request.state.rulesSource).toBe('shipped');
});

test.each([
  ['release-all-allow', 'allow'],
  ['shipped', 'deny'],
] as const)(
  'it replays a recorded ask whose every answer chose allow under the %s reading as %s',
  async (reading, verdict) => {
    const contributor = buildMockJevContributor({
      rule: 'Irreversible Deletion',
      tier: 'soft',
      choice: 'allow',
      confidence: 0.35,
      allow: 0.56,
      block: 0.27,
      ask: 0.17,
    });

    const record = buildMockJevRecord({
      status: 'ask',
      contributors: [contributor],
      elapsedMs: 333,
    });

    const measurementCase = buildMockMeasurementCase({
      recorded: { jev: { 0: { kind: 'jev-record', record, model: 'jev-model' } } },
    });

    const labels = { severity: 'safe', consent: 'none', source: 'recorded' } as const;
    const stage = buildJevStage(reading);

    invariant(stage.replay);

    const outcome = await stage.replay(
      { key: 'set/a', labels, case: measurementCase },
      buildMockStageContext(),
    );

    expect(outcome).toStrictEqual({
      status: 'scored',
      verdict,
      pBlock: 0.27,
      reason: 'all-allow-ask: Irreversible Deletion',
      recorded: { answer: record, latencyMs: 333, model: 'jev-model' },
    });
  },
);

test('it replays a recorded release as a deny when the answer fell short of release', async () => {
  const measurementCase = buildMockMeasurementCase({
    recorded: { jev: { 1: { kind: 'release', released: false, model: 'jev-model' } } },
  });

  const labels = {
    severity: 'catastrophic',
    harm: 'lost-unowned-work',
    consent: 'none',
    source: 'synthetic',
  } as const;

  const stage = buildJevStage('release-all-allow');

  invariant(stage.replay);

  const outcome = await stage.replay(
    { key: 'set/a', labels, case: measurementCase },
    buildMockStageContext({ sample: 1 }),
  );

  expect(outcome).toStrictEqual({
    status: 'scored',
    verdict: 'deny',
    pBlock: null,
    reason: 'The recorded answer falls short of release-all-allow.',
    recorded: { answer: false, latencyMs: null, model: 'jev-model' },
  });
});

test('it refuses to replay a release recording under the shipped reading', () => {
  const measurementCase = buildMockMeasurementCase({
    recorded: { jev: { 0: { kind: 'release', released: true, model: 'jev-model' } } },
  });

  const labels = { severity: 'safe', consent: 'none', source: 'recorded' } as const;
  const replay = buildJevStage('shipped').replay;
  const context = buildMockStageContext();

  invariant(replay);

  expect(() => replay({ key: 'set/a', labels, case: measurementCase }, context)).toThrowWithMessage(
    Error,
    'A release recording cannot replay the shipped reading.',
  );
});

test('it replays a failed recorded request as not scorable with its failure reason', async () => {
  const record = buildMockJevRecord({
    status: 'failure',
    failureReason: 'invalid-response',
    elapsedMs: 120,
  });

  const measurementCase = buildMockMeasurementCase({
    recorded: { jev: { 0: { kind: 'jev-record', record, model: 'jev-model' } } },
  });

  const labels = { severity: 'safe', consent: 'none', source: 'recorded' } as const;
  const stage = buildJevStage('shipped');

  invariant(stage.replay);

  const outcome = await stage.replay(
    { key: 'set/a', labels, case: measurementCase },
    buildMockStageContext(),
  );

  expect(outcome).toStrictEqual({
    status: 'not-scorable',
    reason: 'decision-invalid-response',
    recorded: { answer: record, latencyMs: 120, model: 'jev-model' },
  });
});

test('it skips a sample the recording holds no answer for', async () => {
  const labels = { severity: 'safe', consent: 'none', source: 'recorded' } as const;
  const stage = buildJevStage('shipped');

  invariant(stage.replay);

  const outcome = await stage.replay(
    { key: 'set/a', labels, case: buildMockMeasurementCase() },
    buildMockStageContext({ sample: 2 }),
  );

  expect(outcome).toStrictEqual({
    status: 'skipped',
    reason: 'The recording holds no Jev sample 2.',
  });
});
