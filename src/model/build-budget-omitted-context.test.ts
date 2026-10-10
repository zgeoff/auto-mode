import { expect, test } from 'bun:test';
import { buildMockDecisionContext } from '../../test-utils/factories/build-mock-decision-context.ts';
import { buildBudgetOmittedContext } from './build-budget-omitted-context.ts';

test('it drops the task and records the budget as the reason', () => {
  const context = buildMockDecisionContext({
    agentID: 'child',
    originalUserTask: { text: 'Build the parser', origin: 'composer' },
    delegatedTask: { text: 'Write the tests', origin: 'agent.spawn' },
    lastDirectUserMessage: null,
    omittedTaskContext: [],
  });

  expect(buildBudgetOmittedContext(context, 'delegatedTask')).toStrictEqual({
    agentID: 'child',
    originalUserTask: { text: 'Build the parser', origin: 'composer' },
    delegatedTask: null,
    lastDirectUserMessage: null,
    omittedTaskContext: [{ field: 'delegatedTask', reason: 'budget' }],
  });
});

test('it replaces an earlier omission of the same task', () => {
  const context = buildMockDecisionContext({
    agentID: null,
    originalUserTask: { text: 'Build the parser', origin: 'composer' },
    delegatedTask: null,
    lastDirectUserMessage: null,
    omittedTaskContext: [
      { field: 'originalUserTask', reason: 'unavailable' },
      { field: 'delegatedTask', reason: 'unavailable' },
    ],
  });

  expect(buildBudgetOmittedContext(context, 'originalUserTask')).toStrictEqual({
    agentID: null,
    originalUserTask: null,
    delegatedTask: null,
    lastDirectUserMessage: null,
    omittedTaskContext: [
      { field: 'delegatedTask', reason: 'unavailable' },
      { field: 'originalUserTask', reason: 'budget' },
    ],
  });
});
