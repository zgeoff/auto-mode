import { expect, test } from 'bun:test';
import { planDenialBudget } from './plan-denial-budget.ts';
import { EMPTY_DENIAL_STATE } from './types.ts';

const BUDGET = { consecutive: 3, perSession: 20 };
const DENY = { kind: 'deny', rule: 'Rule', reason: 'Base reason.' } as const;

test('it counts a deny and states the denials left', () => {
  const plan = planDenialBudget(EMPTY_DENIAL_STATE, DENY, 'action-a', BUDGET);

  expect(plan).toStrictEqual({
    verdict: {
      kind: 'deny',
      rule: 'Rule',
      reason: 'Base reason. Denials left before auto-mode asks the user: 2.',
    },
    state: {
      consecutive: 1,
      session: 1,
      lastDenied: { actionHash: 'action-a', rule: 'Rule', reason: 'Base reason.' },
    },
    escalation: false,
  });
});

test('it tells the agent to stop and report on the last deny before the limit', () => {
  const state = { consecutive: 2, session: 2, lastDenied: null };
  const plan = planDenialBudget(state, DENY, 'action-c', BUDGET);

  expect(plan.verdict).toStrictEqual({
    kind: 'deny',
    rule: 'Rule',
    reason:
      'Base reason. This is the last denial before auto-mode asks the user. Stop now, without finishing the rest of the task, and tell the user what consent you need to continue.',
  });

  expect(plan.escalation).toBeFalse();
});

test('it resets the consecutive count on an allow and keeps the session count', () => {
  const state = {
    consecutive: 2,
    session: 7,
    lastDenied: { actionHash: 'action-a', rule: 'Rule', reason: 'Base reason.' },
  };

  const plan = planDenialBudget(state, { kind: 'allow' }, 'action-b', BUDGET);

  expect(plan).toStrictEqual({
    verdict: { kind: 'allow' },
    state: { consecutive: 0, session: 7, lastDenied: null },
    escalation: false,
  });
});

test('it gives the action that exceeds the consecutive budget to the user and resets both counts', () => {
  const state = { consecutive: 3, session: 3, lastDenied: null };
  const plan = planDenialBudget(state, DENY, 'action-d', BUDGET);

  expect(plan).toStrictEqual({ verdict: null, state: EMPTY_DENIAL_STATE, escalation: true });
});

test('it gives the action that exceeds the per-session budget to the user', () => {
  const state = { consecutive: 1, session: 20, lastDenied: null };
  const plan = planDenialBudget(state, DENY, 'action-e', BUDGET);

  expect(plan).toStrictEqual({ verdict: null, state: EMPTY_DENIAL_STATE, escalation: true });
});

test('it counts the per-session budget in the denials left when it is the nearer limit', () => {
  const state = { consecutive: 0, session: 18, lastDenied: null };
  const plan = planDenialBudget(state, DENY, 'action-f', BUDGET);

  expect(plan.verdict).toStrictEqual({
    kind: 'deny',
    rule: 'Rule',
    reason: 'Base reason. Denials left before auto-mode asks the user: 1.',
  });
});

test('it follows a configured budget', () => {
  const budget = { consecutive: 1, perSession: 5 };
  const first = planDenialBudget(EMPTY_DENIAL_STATE, DENY, 'action-a', budget);
  const second = planDenialBudget(first.state, DENY, 'action-b', budget);

  expect(first.verdict?.kind).toBe('deny');
  expect(second.escalation).toBeTrue();
});

test('it leaves the counts alone when there is no verdict', () => {
  const state = { consecutive: 2, session: 2, lastDenied: null };
  const plan = planDenialBudget(state, null, 'action-a', BUDGET);

  expect(plan).toStrictEqual({ verdict: null, state, escalation: false });
});
