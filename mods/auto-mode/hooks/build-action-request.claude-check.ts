import { expect, test } from 'claude-code/testing';
import { buildActionRequest } from './build-action-request.ts';

test('it builds the main agent request with its prompts', () => {
  expect(
    buildActionRequest({
      sessionID: 'session-1',
      toolUseID: 'call-1',
      cwd: '/repo',
      toolName: 'Bash',
      toolInput: { command: 'rm -rf dist' },
      agentID: null,
      delegatedText: undefined,
      prompts: {
        originalUserTask: { text: 'Clean the build output.', origin: 'composer' },
        lastDirectUserMessage: { text: 'Clean it now.', origin: 'bridge', freshness: 'stale' },
        canCaptureOriginal: false,
      },
    }),
  ).toStrictEqual({
    sessionID: 'session-1',
    toolUseID: 'call-1',
    cwd: '/repo',
    toolName: 'Bash',
    toolInput: { command: 'rm -rf dist' },
    context: {
      agentID: null,
      originalUserTask: { text: 'Clean the build output.', origin: 'composer' },
      delegatedTask: null,
      lastDirectUserMessage: { text: 'Clean it now.', origin: 'bridge', freshness: 'stale' },
      omittedTaskContext: [],
    },
  });
});

test('it leaves the child rule for the CLI and sends the last direct message as captured', () => {
  expect(
    buildActionRequest({
      sessionID: 'session-1',
      toolUseID: undefined,
      cwd: '/repo/child',
      toolName: 'Bash',
      toolInput: { command: 'git push --force' },
      agentID: 'worker',
      delegatedText: 'Fix the parser.',
      prompts: {
        originalUserTask: null,
        lastDirectUserMessage: { text: 'Force push is fine.', origin: 'composer' },
        canCaptureOriginal: false,
      },
    }),
  ).toStrictEqual({
    sessionID: 'session-1',
    cwd: '/repo/child',
    toolName: 'Bash',
    toolInput: { command: 'git push --force' },
    context: {
      agentID: 'worker',
      originalUserTask: null,
      delegatedTask: { text: 'Fix the parser.', origin: 'agent.spawn' },
      lastDirectUserMessage: { text: 'Force push is fine.', origin: 'composer' },
      omittedTaskContext: [{ field: 'originalUserTask', reason: 'unavailable' }],
    },
  });
});

test('it reports the delegated task unavailable for a child spawned before the mod loaded', () => {
  expect(
    buildActionRequest({
      sessionID: 'session-1',
      toolUseID: 'call-1',
      cwd: '/repo',
      toolName: 'Read',
      toolInput: { file_path: '/repo/a.ts' },
      agentID: 'worker',
      delegatedText: undefined,
      prompts: {
        originalUserTask: { text: 'Build the parser', origin: 'sdk' },
        lastDirectUserMessage: null,
        canCaptureOriginal: false,
      },
    }).context.omittedTaskContext,
  ).toStrictEqual([{ field: 'delegatedTask', reason: 'unavailable' }]);
});
