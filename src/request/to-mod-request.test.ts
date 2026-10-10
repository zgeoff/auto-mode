import { expect, test } from 'bun:test';
import invariant from 'tiny-invariant';
import type { ModRequest } from '../../mods/auto-mode/contract/types.ts';
import { parseActionRequest } from './parse-action-request.ts';
import { toModRequest } from './to-mod-request.ts';

test('it renders a parsed request back as the body the mod sent', () => {
  const body: ModRequest = {
    sessionID: 'session',
    toolUseID: 'toolu_1',
    cwd: '/repo',
    toolName: 'Bash',
    toolInput: { command: 'rm -rf dist' },
    context: {
      agentID: null,
      originalUserTask: { text: 'Clean the build output', origin: 'composer' },
      delegatedTask: null,
      lastDirectUserMessage: { text: 'Clean it', origin: 'bridge', freshness: 'stale' },
      omittedTaskContext: [{ field: 'delegatedTask', reason: 'unavailable' }],
    },
  };

  const request = parseActionRequest(body);

  invariant(request !== null, 'the body is a mod request');

  expect(toModRequest(request)).toStrictEqual(body);
});

test('it renders a child request without the direct message the parse dropped', () => {
  const request = parseActionRequest({
    sessionID: 'session',
    cwd: '/repo',
    toolName: 'Bash',
    toolInput: { command: 'git push --force' },
    context: {
      agentID: 'worker',
      originalUserTask: null,
      delegatedTask: { text: 'Fix the parser', origin: 'agent.spawn' },
      lastDirectUserMessage: { text: 'Force push is fine', origin: 'composer' },
      omittedTaskContext: [],
    },
  });

  invariant(request !== null, 'the body is a mod request');

  expect(toModRequest(request)).toStrictEqual({
    sessionID: 'session',
    cwd: '/repo',
    toolName: 'Bash',
    toolInput: { command: 'git push --force' },
    context: {
      agentID: 'worker',
      originalUserTask: null,
      delegatedTask: { text: 'Fix the parser', origin: 'agent.spawn' },
      lastDirectUserMessage: null,
      omittedTaskContext: [],
    },
  });
});
