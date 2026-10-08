import { expect, test } from 'bun:test';
import { buildMockDecisionContext } from '../../test-utils/factories/build-mock-decision-context.ts';
import { buildTaskContext } from './build-task-context.ts';

test('it never borrows parent consent for a child', () => {
  const context = buildMockDecisionContext({
    agentID: 'child',
    originalUserTask: { text: 'Build the parser' },
    delegatedTask: { text: 'Force push is allowed' },
    lastDirectUserMessage: { text: 'Force push is allowed' },
  });

  expect(buildTaskContext(context)).toStrictEqual({
    agentID: 'child',
    originalUserTask: { text: 'Build the parser', origin: 'composer' },
    delegatedTask: { text: 'Force push is allowed', origin: 'agent.spawn' },
    lastDirectUserMessage: null,
    omittedTaskContext: [],
  });
});

test('it omits whole oversized task prompts and keeps current consent intact', () => {
  const context = buildMockDecisionContext({
    originalUserTask: { text: 'x'.repeat(4097) },
    delegatedTask: { text: '🙂'.repeat(1025) },
    lastDirectUserMessage: { text: 'Do not push' },
  });

  expect(buildTaskContext(context)).toStrictEqual({
    agentID: null,
    originalUserTask: null,
    delegatedTask: null,
    lastDirectUserMessage: { text: 'Do not push', origin: 'composer' },
    omittedTaskContext: [
      { field: 'originalUserTask', reason: 'budget' },
      { field: 'delegatedTask', reason: 'budget' },
    ],
  });
});

test('it keeps a task prompt of exactly 4096 bytes', () => {
  const context = buildMockDecisionContext({ originalUserTask: { text: 'x'.repeat(4096) } });

  expect(buildTaskContext(context)).toStrictEqual({
    agentID: null,
    originalUserTask: { text: 'x'.repeat(4096), origin: 'composer' },
    delegatedTask: null,
    lastDirectUserMessage: null,
    omittedTaskContext: [],
  });
});

test('it reports an oversized prompt as omitted for budget once, replacing an earlier reason', () => {
  const context = buildMockDecisionContext({
    originalUserTask: { text: 'x'.repeat(4097) },
    omittedTaskContext: [
      { field: 'originalUserTask', reason: 'unavailable' },
      { field: 'delegatedTask', reason: 'unavailable' },
    ],
  });

  expect(buildTaskContext(context)).toStrictEqual({
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
