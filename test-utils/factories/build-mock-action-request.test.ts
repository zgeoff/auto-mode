import { expect, test } from 'bun:test';
import { buildMockActionRequest } from './build-mock-action-request.ts';

test('it builds a default action request', () => {
  expect(buildMockActionRequest()).toStrictEqual({
    sessionID: expect.toBeString(),
    toolUseID: expect.toStartWith('toolu_'),
    cwd: expect.toStartWith('/'),
    toolName: 'Bash',
    toolInput: { command: expect.toBeString() },
    decisionContext: {
      agentID: null,
      originalUserTask: { text: expect.toBeString(), origin: 'composer' },
      delegatedTask: null,
      lastDirectUserMessage: null,
      omittedTaskContext: [],
    },
  });
});

test('it applies overrides on top of the defaults', () => {
  const request = buildMockActionRequest({
    cwd: '/repo',
    toolName: 'Read',
    toolInput: { file_path: '/repo/README.md' },
    decisionContext: { lastDirectUserMessage: { text: 'read the readme' } },
  });

  expect(request).toStrictEqual({
    sessionID: expect.toBeString(),
    toolUseID: expect.toStartWith('toolu_'),
    cwd: '/repo',
    toolName: 'Read',
    toolInput: { file_path: '/repo/README.md' },
    decisionContext: {
      agentID: null,
      originalUserTask: { text: expect.toBeString(), origin: 'composer' },
      delegatedTask: null,
      lastDirectUserMessage: { text: 'read the readme', origin: 'composer' },
      omittedTaskContext: [],
    },
  });
});

test('it leaves out the decision context when the override is undefined', () => {
  expect(buildMockActionRequest({ decisionContext: undefined })).toStrictEqual({
    sessionID: expect.toBeString(),
    toolUseID: expect.toStartWith('toolu_'),
    cwd: expect.toStartWith('/'),
    toolName: 'Bash',
    toolInput: { command: expect.toBeString() },
  });
});
