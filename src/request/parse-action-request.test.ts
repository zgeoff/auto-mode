import { expect, test } from 'bun:test';
import { readFixture } from '../../test-utils/read-fixture.ts';
import { parseActionRequest } from './parse-action-request.ts';

const CONTEXT = {
  agentID: null,
  originalUserTask: { text: 'Clean the build output', origin: 'composer' },
  delegatedTask: null,
  lastDirectUserMessage: { text: 'Clean the build output', origin: 'composer' },
  omittedTaskContext: [],
} as const;

const REQUEST = {
  sessionID: 'session',
  toolUseID: 'toolu_1',
  cwd: '/repo',
  toolName: 'Bash',
  toolInput: { command: 'rm -rf dist' },
  context: CONTEXT,
};

// Recorded from the mod in a live Claude Code session.
test('it normalises a recorded mod request', () => {
  expect(parseActionRequest(readFixture('mod-request-regenerable'))).toMatchObject({
    toolName: 'Bash',
    toolInput: { command: 'rm -rf dist' },
    decisionContext: { agentID: null, lastDirectUserMessage: { origin: 'sdk' } },
  });
});

test('it carries the session identity, the action and the task context', () => {
  expect(parseActionRequest(REQUEST)).toStrictEqual({
    sessionID: 'session',
    toolUseID: 'toolu_1',
    cwd: '/repo',
    toolName: 'Bash',
    toolInput: { command: 'rm -rf dist' },
    decisionContext: CONTEXT,
  });
});

const NOT_A_REQUEST: [string, unknown][] = [
  ['a string', 'not an object'],
  ['null', null],
  ['an array', []],
  ['a request with no session identity', { ...REQUEST, sessionID: undefined }],
  ['a request with no task context', { ...REQUEST, context: undefined }],
  ['a request with no tool name', { ...REQUEST, toolName: '' }],
  ['a request with an unknown field', { ...REQUEST, transcript_path: '/parent.jsonl' }],
  [
    'a Claude Code hook payload',
    { hook_event_name: 'PermissionRequest', prompt_id: 'p', tool_name: 'Read', tool_input: {} },
  ],
];

// A null is not a refusal: the mod keeps the prompt Claude Code was about to show.
test.each(NOT_A_REQUEST)('it has nothing to say about %s', (_label, body) => {
  expect(parseActionRequest(body)).toBeNull();
});

test('it strips supplied parent consent from a child context', () => {
  const request = parseActionRequest({
    ...REQUEST,
    toolInput: { command: 'git push --force' },
    context: {
      agentID: 'child',
      originalUserTask: { text: 'Build the parser', origin: 'composer' },
      delegatedTask: { text: 'Force push allowed', origin: 'agent.spawn' },
      lastDirectUserMessage: { text: 'Parent says force push allowed', origin: 'composer' },
      omittedTaskContext: [],
    },
  });

  expect(request).toMatchObject({
    decisionContext: {
      agentID: 'child',
      lastDirectUserMessage: null,
      delegatedTask: { text: 'Force push allowed', origin: 'agent.spawn' },
    },
  });
});

test('it refuses malformed task context rather than judging without it', () => {
  expect(
    parseActionRequest({
      ...REQUEST,
      context: { agentID: 'child', lastDirectUserMessage: 'parent consent' },
    }),
  ).toBeNull();
});
