import { expect, test } from 'bun:test';
import { buildMockModRequest } from './build-mock-mod-request.ts';

test('it builds a default mod request', () => {
  expect(buildMockModRequest()).toStrictEqual({
    sessionID: expect.toBeString(),
    toolUseID: expect.toStartWith('toolu_'),
    cwd: expect.toStartWith('/'),
    toolName: 'Bash',
    toolInput: { command: expect.toBeString() },
    context: {
      agentID: null,
      originalUserTask: { text: expect.toBeString(), origin: 'composer' },
      delegatedTask: null,
      lastDirectUserMessage: null,
      omittedTaskContext: [],
    },
  });
});

test('it applies overrides on top of the defaults', () => {
  const request = buildMockModRequest({
    sessionID: 'session-1',
    cwd: '/repo',
    toolName: 'Read',
    toolInput: { file_path: '/repo/README.md' },
    context: { agentID: 'subagent', originalUserTask: null },
  });

  expect(request).toStrictEqual({
    sessionID: 'session-1',
    toolUseID: expect.toStartWith('toolu_'),
    cwd: '/repo',
    toolName: 'Read',
    toolInput: { file_path: '/repo/README.md' },
    context: {
      agentID: 'subagent',
      originalUserTask: null,
      delegatedTask: null,
      lastDirectUserMessage: null,
      omittedTaskContext: [],
    },
  });
});
