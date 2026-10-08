import { expect, test } from 'bun:test';
import invariant from 'tiny-invariant';
import type * as z from 'zod';
import { actionRequestSchema } from './action-request-schema.ts';

test('it accepts a complete mod request', () => {
  const payload: z.input<typeof actionRequestSchema> = {
    sessionID: 'session',
    toolUseID: 'toolu_1',
    cwd: '/repo',
    toolName: 'Bash',
    toolInput: { command: 'rm -rf dist' },
    context: {
      agentID: null,
      originalUserTask: { text: 'Clean the build output', origin: 'composer' },
      delegatedTask: null,
      lastDirectUserMessage: { text: 'Clean the build output', origin: 'composer' },
      omittedTaskContext: [],
    },
  };

  const result = actionRequestSchema.safeParse(payload);

  expect(result.data).toStrictEqual(payload);
});

test.each([
  ['a string', 'not an object', { code: 'invalid_type', path: [] }],
  ['null', null, { code: 'invalid_type', path: [] }],
  ['an array', [], { code: 'invalid_type', path: [] }],
  [
    'a request with no session identity',
    {
      toolUseID: 'toolu_1',
      cwd: '/repo',
      toolName: 'Bash',
      toolInput: { command: 'rm -rf dist' },
      context: {
        agentID: null,
        originalUserTask: { text: 'Clean the build output', origin: 'composer' },
        delegatedTask: null,
        lastDirectUserMessage: { text: 'Clean the build output', origin: 'composer' },
        omittedTaskContext: [],
      },
    },
    { path: ['sessionID'] },
  ],
  [
    'a request with no task context',
    {
      sessionID: 'session',
      toolUseID: 'toolu_1',
      cwd: '/repo',
      toolName: 'Bash',
      toolInput: { command: 'rm -rf dist' },
    },
    { path: ['context'] },
  ],
  [
    'a request with no tool name',
    {
      sessionID: 'session',
      toolUseID: 'toolu_1',
      cwd: '/repo',
      toolName: '',
      toolInput: { command: 'rm -rf dist' },
      context: {
        agentID: null,
        originalUserTask: { text: 'Clean the build output', origin: 'composer' },
        delegatedTask: null,
        lastDirectUserMessage: { text: 'Clean the build output', origin: 'composer' },
        omittedTaskContext: [],
      },
    },
    { path: ['toolName'] },
  ],
  [
    'a request with an unknown field',
    {
      sessionID: 'session',
      toolUseID: 'toolu_1',
      cwd: '/repo',
      toolName: 'Bash',
      toolInput: { command: 'rm -rf dist' },
      context: {
        agentID: null,
        originalUserTask: { text: 'Clean the build output', origin: 'composer' },
        delegatedTask: null,
        lastDirectUserMessage: { text: 'Clean the build output', origin: 'composer' },
        omittedTaskContext: [],
      },
      transcript_path: '/parent.jsonl',
    },
    { code: 'unrecognized_keys', keys: ['transcript_path'], path: [] },
  ],
  [
    'a request whose last direct user message is not a user task',
    {
      sessionID: 'session',
      toolUseID: 'toolu_1',
      cwd: '/repo',
      toolName: 'Bash',
      toolInput: { command: 'rm -rf dist' },
      context: {
        agentID: null,
        originalUserTask: { text: 'Clean the build output', origin: 'composer' },
        delegatedTask: null,
        lastDirectUserMessage: 'Clean the build output',
        omittedTaskContext: [],
      },
    },
    { path: ['context', 'lastDirectUserMessage'] },
  ],
  [
    'a Claude Code hook payload',
    { hook_event_name: 'PermissionRequest', prompt_id: 'p', tool_name: 'Read', tool_input: {} },
    {
      code: 'unrecognized_keys',
      keys: ['hook_event_name', 'prompt_id', 'tool_name', 'tool_input'],
      path: [],
    },
  ],
])('it rejects %s', (_label, payload, issue) => {
  const result = actionRequestSchema.safeParse(payload);

  invariant(result.error, 'the schema rejects the payload');

  expect(result.error.issues).toPartiallyContain(issue);
});
