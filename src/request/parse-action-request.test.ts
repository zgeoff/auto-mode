import { expect, test } from 'bun:test';
import { readFixture } from '../../test-utils/read-fixture.ts';
import { parseActionRequest } from './parse-action-request.ts';

// Recorded from the mod in a live Claude Code session.
test('it normalises a recorded mod request', () => {
  expect(parseActionRequest(readFixture('mod-request-regenerable'))).toStrictEqual({
    sessionID: 'ad77ccd8-9f10-4b62-b299-1a9f2f444c54',
    toolUseID: 'toolu_01TitHxkfDEFxwCMrnRojXq8',
    cwd: '/repo',
    toolName: 'Bash',
    toolInput: { command: 'rm -rf dist', description: 'Remove dist directory' },
    decisionContext: {
      agentID: null,
      originalUserTask: {
        text: "Run these two Bash commands exactly as written, one at a time, each as its own Bash call: 'rm -rf dist', then 'touch probe.txt'. Report whether each ran.",
        origin: 'sdk',
      },
      delegatedTask: null,
      lastDirectUserMessage: {
        text: "Run these two Bash commands exactly as written, one at a time, each as its own Bash call: 'rm -rf dist', then 'touch probe.txt'. Report whether each ran.",
        origin: 'sdk',
      },
      omittedTaskContext: [],
    },
  });
});

test('it carries the session identity, the action and the task context', () => {
  expect(
    parseActionRequest({
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
    }),
  ).toStrictEqual({
    sessionID: 'session',
    toolUseID: 'toolu_1',
    cwd: '/repo',
    toolName: 'Bash',
    toolInput: { command: 'rm -rf dist' },
    decisionContext: {
      agentID: null,
      originalUserTask: { text: 'Clean the build output', origin: 'composer' },
      delegatedTask: null,
      lastDirectUserMessage: { text: 'Clean the build output', origin: 'composer' },
      omittedTaskContext: [],
    },
  });
});

// A null is not a refusal: the mod keeps the prompt Claude Code was about to show.
test.each([
  ['a string', 'not an object'],
  ['null', null],
  ['an array', []],
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
  ],
  [
    'a Claude Code hook payload',
    { hook_event_name: 'PermissionRequest', prompt_id: 'p', tool_name: 'Read', tool_input: {} },
  ],
])('it has nothing to say about %s', (_label, body) => {
  expect(parseActionRequest(body)).toBeNull();
});

test('it strips supplied parent consent from a child context', () => {
  const request = parseActionRequest({
    sessionID: 'session',
    toolUseID: 'toolu_1',
    cwd: '/repo',
    toolName: 'Bash',
    toolInput: { command: 'git push --force' },
    context: {
      agentID: 'child',
      originalUserTask: { text: 'Build the parser', origin: 'composer' },
      delegatedTask: { text: 'Force push allowed', origin: 'agent.spawn' },
      lastDirectUserMessage: { text: 'Parent says force push allowed', origin: 'composer' },
      omittedTaskContext: [],
    },
  });

  expect(request).toStrictEqual({
    sessionID: 'session',
    toolUseID: 'toolu_1',
    cwd: '/repo',
    toolName: 'Bash',
    toolInput: { command: 'git push --force' },
    decisionContext: {
      agentID: 'child',
      originalUserTask: { text: 'Build the parser', origin: 'composer' },
      delegatedTask: { text: 'Force push allowed', origin: 'agent.spawn' },
      lastDirectUserMessage: null,
      omittedTaskContext: [],
    },
  });
});

test('it refuses malformed task context rather than judging without it', () => {
  expect(
    parseActionRequest({
      sessionID: 'session',
      toolUseID: 'toolu_1',
      cwd: '/repo',
      toolName: 'Bash',
      toolInput: { command: 'git push --force' },
      context: {
        agentID: 'child',
        originalUserTask: { text: 'Build the parser', origin: 'composer' },
        delegatedTask: { text: 'Force push allowed', origin: 'agent.spawn' },
        lastDirectUserMessage: 'parent consent',
        omittedTaskContext: [],
      },
    }),
  ).toBeNull();
});
