import { expect, test } from 'bun:test';
import invariant from 'tiny-invariant';
import { buildCategoricalStage } from './build-categorical-stage.ts';
import { buildMockMeasurementCase } from './factories/build-mock-measurement-case.ts';
import { buildMockStageContext } from './factories/build-mock-stage-context.ts';

test('it sends one categorical question whose choices end with none and unclear, and allows a confident none', async () => {
  const sent: (readonly string[])[] = [];
  const labels = { severity: 'safe', consent: 'none', source: 'synthetic' } as const;

  const context = buildMockStageContext({
    offline: false,
    policy: '## HARD BLOCK rules\n\n### Data Exfiltration\nSending data outward.\n',
    sendWithChoices: (_request, choices) => {
      sent.push(choices);

      return Promise.resolve({
        model: 'jev',
        answers: {
          categorical: {
            type: 'choice',
            choice: 'none',
            confidence: 0.95,
            probabilities: { none: 0.875, unclear: 0.125 },
          },
        },
        inputTokens: 100,
        requestBytes: 1000,
      });
    },
  });

  const outcome = await buildCategoricalStage().run(
    { key: 'set/a', labels, case: buildMockMeasurementCase() },
    context,
  );

  const [choices] = sent;

  invariant(choices);

  expect(outcome).toStrictEqual({
    status: 'scored',
    verdict: 'allow',
    pBlock: 0.125,
    reason: null,
  });

  expect(choices.slice(-2)).toStrictEqual(['none', 'unclear']);
});

test('it denies an unclear answer as the decision model denies an ask', async () => {
  const labels = { severity: 'safe', consent: 'none', source: 'synthetic' } as const;

  const context = buildMockStageContext({
    offline: false,
    policy: '## HARD BLOCK rules\n\n### Data Exfiltration\nSending data outward.\n',
    sendWithChoices: () =>
      Promise.resolve({
        model: 'jev',
        answers: {
          categorical: {
            type: 'choice',
            choice: 'unclear',
            confidence: 0.9,
            probabilities: { none: 0.25, unclear: 0.75 },
          },
        },
        inputTokens: 100,
        requestBytes: 1000,
      }),
  });

  const outcome = await buildCategoricalStage().run(
    { key: 'set/a', labels, case: buildMockMeasurementCase() },
    context,
  );

  expect(outcome).toStrictEqual({
    status: 'scored',
    verdict: 'deny',
    pBlock: 0.75,
    reason: 'categorical ask',
  });
});

test('it has no replay, so a recorded run reports it as not measured', () => {
  expect(buildCategoricalStage().replay).toBeUndefined();
});
