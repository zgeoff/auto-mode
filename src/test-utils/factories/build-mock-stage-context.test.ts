import { expect, test } from 'bun:test';
import { buildMockStageContext } from './build-mock-stage-context.ts';

test('it builds a default stage context', () => {
  expect(buildMockStageContext()).toStrictEqual({
    seed: 1,
    sample: 0,
    offline: true,
    policy: 'policy',
    configuredRules: { environment: [], allow: [], soft_deny: [], hard_deny: [] },
    previous: [],
    send: expect.toBeFunction(),
    sendWithChoices: expect.toBeFunction(),
    sendJudge: expect.toBeFunction(),
  });
});

test('it applies overrides on top of the defaults', () => {
  expect(buildMockStageContext({ sample: 2, offline: false })).toStrictEqual({
    seed: 1,
    sample: 2,
    offline: false,
    policy: 'policy',
    configuredRules: { environment: [], allow: [], soft_deny: [], hard_deny: [] },
    previous: [],
    send: expect.toBeFunction(),
    sendWithChoices: expect.toBeFunction(),
    sendJudge: expect.toBeFunction(),
  });
});

test('it rejects a judge request the test did not wire', () => {
  const context = buildMockStageContext();

  expect(context.sendJudge({ user: 'Review this deny.' })).rejects.toThrowWithMessage(
    Error,
    'The stage sent a judge request.',
  );
});
