import { expect, test } from 'bun:test';
import { buildTaskContext } from './build-task-context.ts';

test('it never borrows parent consent for a child', () => {
  const result = buildTaskContext({
    agentID: 'child',
    originalUserTask: { text: 'Build the parser', origin: 'composer' },
    delegatedTask: { text: 'Force push is allowed', origin: 'agent.spawn' },
    lastDirectUserMessage: { text: 'Force push is allowed', origin: 'composer' },
    omittedTaskContext: [],
  });

  expect(result.lastDirectUserMessage).toBeNull();

  expect(result.delegatedTask).toStrictEqual({
    text: 'Force push is allowed',
    origin: 'agent.spawn',
  });
});

test('it omits whole oversized task prompts and keeps current consent intact', () => {
  const lastDirectUserMessage = { text: 'Do not push', origin: 'composer' as const };

  expect(
    buildTaskContext({
      agentID: null,
      originalUserTask: { text: 'x'.repeat(4097), origin: 'composer' },
      delegatedTask: { text: '🙂'.repeat(1025), origin: 'agent.spawn' },
      lastDirectUserMessage,
      omittedTaskContext: [],
    }),
  ).toStrictEqual({
    agentID: null,
    originalUserTask: null,
    delegatedTask: null,
    lastDirectUserMessage,
    omittedTaskContext: [
      { field: 'originalUserTask', reason: 'budget' },
      { field: 'delegatedTask', reason: 'budget' },
    ],
  });
});
