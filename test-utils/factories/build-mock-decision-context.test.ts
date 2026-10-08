import { expect, test } from 'bun:test';
import { buildMockDecisionContext } from './build-mock-decision-context.ts';

test('it builds a default decision context', () => {
  expect(buildMockDecisionContext()).toStrictEqual({
    agentID: null,
    originalUserTask: { text: expect.toBeString(), origin: 'composer' },
    delegatedTask: null,
    lastDirectUserMessage: null,
    omittedTaskContext: [],
  });
});

test('it applies overrides on top of the defaults', () => {
  const context = buildMockDecisionContext({
    agentID: 'agent-1',
    originalUserTask: null,
    delegatedTask: { text: 'review the diff' },
    lastDirectUserMessage: { origin: 'bridge' },
    omittedTaskContext: [{ field: 'originalUserTask', reason: 'budget' }],
  });

  expect(context).toStrictEqual({
    agentID: 'agent-1',
    originalUserTask: null,
    delegatedTask: { text: 'review the diff', origin: 'agent.spawn' },
    lastDirectUserMessage: { text: expect.toBeString(), origin: 'bridge' },
    omittedTaskContext: [{ field: 'originalUserTask', reason: 'budget' }],
  });
});
