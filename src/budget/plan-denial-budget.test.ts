import { expect, test } from 'bun:test';
import { buildMockDenialBudget } from '../../test-utils/factories/build-mock-denial-budget.ts';
import { buildMockDenialState } from '../../test-utils/factories/build-mock-denial-state.ts';
import { buildMockVerdict } from '../../test-utils/factories/build-mock-verdict.ts';
import { planDenialBudget } from './plan-denial-budget.ts';

test('it counts a deny and states the denials left', () => {
  const plan = planDenialBudget(
    buildMockDenialState({ consecutive: 0, session: 0, lastDenied: null }),
    buildMockVerdict({ kind: 'deny', rule: 'Rule', reason: 'Base reason.' }),
    'action-a',
    buildMockDenialBudget({ consecutive: 3, perSession: 20 }),
  );

  expect(plan).toStrictEqual({
    verdict: {
      kind: 'deny',
      rule: 'Rule',
      reason: 'Base reason. Denials left before auto-mode asks the user: 2.',
    },
    state: {
      consecutive: 1,
      session: 1,
      lastDenied: { retryKey: 'action-a', rule: 'Rule', reason: 'Base reason.' },
    },
    escalation: false,
  });
});

test('it tells the agent to stop and report on the last deny before the limit', () => {
  const plan = planDenialBudget(
    buildMockDenialState({ consecutive: 2, session: 2, lastDenied: null }),
    buildMockVerdict({ kind: 'deny', rule: 'Rule', reason: 'Base reason.' }),
    'action-c',
    buildMockDenialBudget({ consecutive: 3, perSession: 20 }),
  );

  expect(plan).toStrictEqual({
    verdict: {
      kind: 'deny',
      rule: 'Rule',
      reason:
        'Base reason. This is the last denial before auto-mode asks the user. Stop now, without finishing the rest of the task, and tell the user what consent you need to continue.',
    },
    state: {
      consecutive: 3,
      session: 3,
      lastDenied: { retryKey: 'action-c', rule: 'Rule', reason: 'Base reason.' },
    },
    escalation: false,
  });
});

test('it resets the consecutive count on an allow and keeps the session count', () => {
  const plan = planDenialBudget(
    buildMockDenialState({
      consecutive: 2,
      session: 7,
      lastDenied: { retryKey: 'action-a', rule: 'Rule', reason: 'Base reason.' },
    }),
    buildMockVerdict({ kind: 'allow' }),
    'action-b',
    buildMockDenialBudget({ consecutive: 3, perSession: 20 }),
  );

  expect(plan).toStrictEqual({
    verdict: { kind: 'allow' },
    state: { consecutive: 0, session: 7, lastDenied: null },
    escalation: false,
  });
});

test('it gives the action that exceeds the consecutive budget to the user and resets both counts', () => {
  const plan = planDenialBudget(
    buildMockDenialState({ consecutive: 3, session: 3, lastDenied: null }),
    buildMockVerdict({ kind: 'deny', rule: 'Rule', reason: 'Base reason.' }),
    'action-d',
    buildMockDenialBudget({ consecutive: 3, perSession: 20 }),
  );

  expect(plan).toStrictEqual({
    verdict: null,
    state: { consecutive: 0, session: 0, lastDenied: null },
    escalation: true,
  });
});

test('it gives the action that exceeds the per-session budget to the user', () => {
  const plan = planDenialBudget(
    buildMockDenialState({ consecutive: 1, session: 20, lastDenied: null }),
    buildMockVerdict({ kind: 'deny', rule: 'Rule', reason: 'Base reason.' }),
    'action-e',
    buildMockDenialBudget({ consecutive: 3, perSession: 20 }),
  );

  expect(plan).toStrictEqual({
    verdict: null,
    state: { consecutive: 0, session: 0, lastDenied: null },
    escalation: true,
  });
});

test('it counts the per-session budget in the denials left when it is the nearer limit', () => {
  const plan = planDenialBudget(
    buildMockDenialState({ consecutive: 0, session: 18, lastDenied: null }),
    buildMockVerdict({ kind: 'deny', rule: 'Rule', reason: 'Base reason.' }),
    'action-f',
    buildMockDenialBudget({ consecutive: 3, perSession: 20 }),
  );

  expect(plan).toStrictEqual({
    verdict: {
      kind: 'deny',
      rule: 'Rule',
      reason: 'Base reason. Denials left before auto-mode asks the user: 1.',
    },
    state: {
      consecutive: 1,
      session: 19,
      lastDenied: { retryKey: 'action-f', rule: 'Rule', reason: 'Base reason.' },
    },
    escalation: false,
  });
});

test('it states the last denial at once under a configured budget of one in a row', () => {
  const plan = planDenialBudget(
    buildMockDenialState({ consecutive: 0, session: 0, lastDenied: null }),
    buildMockVerdict({ kind: 'deny', rule: 'Rule', reason: 'Base reason.' }),
    'action-a',
    buildMockDenialBudget({ consecutive: 1, perSession: 5 }),
  );

  expect(plan).toStrictEqual({
    verdict: {
      kind: 'deny',
      rule: 'Rule',
      reason:
        'Base reason. This is the last denial before auto-mode asks the user. Stop now, without finishing the rest of the task, and tell the user what consent you need to continue.',
    },
    state: {
      consecutive: 1,
      session: 1,
      lastDenied: { retryKey: 'action-a', rule: 'Rule', reason: 'Base reason.' },
    },
    escalation: false,
  });
});

test('it gives the next action to the user under a configured budget of one in a row', () => {
  const plan = planDenialBudget(
    buildMockDenialState({
      consecutive: 1,
      session: 1,
      lastDenied: { retryKey: 'action-a', rule: 'Rule', reason: 'Base reason.' },
    }),
    buildMockVerdict({ kind: 'deny', rule: 'Rule', reason: 'Base reason.' }),
    'action-b',
    buildMockDenialBudget({ consecutive: 1, perSession: 5 }),
  );

  expect(plan).toStrictEqual({
    verdict: null,
    state: { consecutive: 0, session: 0, lastDenied: null },
    escalation: true,
  });
});

test('it leaves the counts alone when there is no verdict', () => {
  const state = buildMockDenialState({ consecutive: 2, session: 2, lastDenied: null });

  const plan = planDenialBudget(
    state,
    null,
    'action-a',
    buildMockDenialBudget({ consecutive: 3, perSession: 20 }),
  );

  expect(plan).toStrictEqual({ verdict: null, state, escalation: false });
});
