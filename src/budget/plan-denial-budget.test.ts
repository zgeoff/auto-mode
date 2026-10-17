import { expect, test } from 'bun:test';
import type { Verdict } from '../request/types.ts';
import { planDenialBudget } from './plan-denial-budget.ts';
import type { DenialPlan } from './plan-denial-budget.ts';
import type { DenialBudget, DenialState } from './types.ts';

interface BudgetCase {
  readonly label: string;
  readonly state: DenialState;
  readonly verdict: Verdict | null;
  readonly retryKey: string;
  readonly budget: DenialBudget;
  readonly expected: DenialPlan;
}

test.each<BudgetCase>([
  {
    label: 'counts a deny and states the denials left',
    state: { consecutive: 0, session: 0, lastDenied: null },
    verdict: { kind: 'deny', rule: 'Rule', reason: 'Base reason.' },
    retryKey: 'action-a',
    budget: { consecutive: 3, perSession: 20 },
    expected: {
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
    },
  },
  {
    label: 'tells the agent to stop and report on the last deny before the limit',
    state: { consecutive: 2, session: 2, lastDenied: null },
    verdict: { kind: 'deny', rule: 'Rule', reason: 'Base reason.' },
    retryKey: 'action-c',
    budget: { consecutive: 3, perSession: 20 },
    expected: {
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
    },
  },
  {
    label: 'resets the consecutive count on an allow and keeps the session count',
    state: {
      consecutive: 2,
      session: 7,
      lastDenied: { retryKey: 'action-a', rule: 'Rule', reason: 'Base reason.' },
    },
    verdict: { kind: 'allow' },
    retryKey: 'action-b',
    budget: { consecutive: 3, perSession: 20 },
    expected: {
      verdict: { kind: 'allow' },
      state: { consecutive: 0, session: 7, lastDenied: null },
      escalation: false,
    },
  },
  {
    label:
      'gives the action that exceeds the consecutive budget to the user and resets both counts',
    state: { consecutive: 3, session: 3, lastDenied: null },
    verdict: { kind: 'deny', rule: 'Rule', reason: 'Base reason.' },
    retryKey: 'action-d',
    budget: { consecutive: 3, perSession: 20 },
    expected: {
      verdict: null,
      state: { consecutive: 0, session: 0, lastDenied: null },
      escalation: true,
    },
  },
  {
    label: 'gives the action that exceeds the per-session budget to the user',
    state: { consecutive: 1, session: 20, lastDenied: null },
    verdict: { kind: 'deny', rule: 'Rule', reason: 'Base reason.' },
    retryKey: 'action-e',
    budget: { consecutive: 3, perSession: 20 },
    expected: {
      verdict: null,
      state: { consecutive: 0, session: 0, lastDenied: null },
      escalation: true,
    },
  },
  {
    label: 'counts the per-session budget in the denials left when it is the nearer limit',
    state: { consecutive: 0, session: 18, lastDenied: null },
    verdict: { kind: 'deny', rule: 'Rule', reason: 'Base reason.' },
    retryKey: 'action-f',
    budget: { consecutive: 3, perSession: 20 },
    expected: {
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
    },
  },
  {
    label: 'states the last denial at once under a configured budget of one in a row',
    state: { consecutive: 0, session: 0, lastDenied: null },
    verdict: { kind: 'deny', rule: 'Rule', reason: 'Base reason.' },
    retryKey: 'action-a',
    budget: { consecutive: 1, perSession: 5 },
    expected: {
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
    },
  },
  {
    label: 'gives the next action to the user under a configured budget of one in a row',
    state: {
      consecutive: 1,
      session: 1,
      lastDenied: { retryKey: 'action-a', rule: 'Rule', reason: 'Base reason.' },
    },
    verdict: { kind: 'deny', rule: 'Rule', reason: 'Base reason.' },
    retryKey: 'action-b',
    budget: { consecutive: 1, perSession: 5 },
    expected: {
      verdict: null,
      state: { consecutive: 0, session: 0, lastDenied: null },
      escalation: true,
    },
  },
  {
    label: 'leaves the counts alone when there is no verdict',
    state: { consecutive: 2, session: 2, lastDenied: null },
    verdict: null,
    retryKey: 'action-a',
    budget: { consecutive: 3, perSession: 20 },
    expected: {
      verdict: null,
      state: { consecutive: 2, session: 2, lastDenied: null },
      escalation: false,
    },
  },
])('it $label', (row) => {
  expect(planDenialBudget(row.state, row.verdict, row.retryKey, row.budget)).toStrictEqual(
    row.expected,
  );
});

test('it keeps the same state when there is no verdict, so the caller takes no lock', () => {
  const state: DenialState = { consecutive: 2, session: 2, lastDenied: null };
  const plan = planDenialBudget(state, null, 'action-a', { consecutive: 3, perSession: 20 });

  expect(plan.state).toBe(state);
});
