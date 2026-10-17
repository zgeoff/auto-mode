import { expect, test } from 'claude-code/testing';
import { CLI_LIMITS } from '../contract/cli-limits.ts';
import { assertDefined } from './test-utils/assert-defined.ts';
import { buildStubProcessRun } from './test-utils/build-stub-process-run.ts';
import { buildMockPermissionDecision } from './test-utils/factories/build-mock-permission-decision.ts';
import { buildMockProcessResult } from './test-utils/factories/build-mock-process-result.ts';
import { buildMockSessionContext } from './test-utils/factories/build-mock-session-context.ts';

test('it takes the session identity from a user prompt when no session has started, without carrying its text', async ($, on) => {
  const decided = buildMockPermissionDecision({ decision: 'ask' });
  const processRun = buildStubProcessRun({ result: buildMockProcessResult({ stdout: '' }) });

  on('classic.UserPromptSubmit', () => ({}));
  on('session.cwd', () => ({ value: '/new-repo' }));
  on('tool.check', () => decided);
  on('process.run', processRun.hook);

  // oxlint-disable-next-line new-cap -- The host event API retains its event spelling.
  await $.classic.UserPromptSubmit({
    ...buildMockSessionContext({
      session_id: 'new-session',
      transcript_path: '/new-repo/current.jsonl',
    }),
    prompt: 'Edit the test fixture.',
  });

  const before = Date.now();

  const result = await $.tool.check({
    tool: 'Write',
    input: { file_path: '/new-repo/fixture', content: 'green' },
  });

  const after = Date.now();
  const [call] = processRun.calls;

  assertDefined(call);

  expect(result).toStrictEqual(decided);

  expect(processRun.calls).toStrictEqual([
    {
      argv: [
        'auto-mode',
        'run',
        '--jev-only',
        '--evaluation-deadline',
        expect.stringMatching(/^\d+$/u),
      ],
      timeoutMs: CLI_LIMITS.evaluationMs,
      request: {
        sessionID: 'new-session',
        cwd: '/new-repo',
        toolName: 'Write',
        toolInput: { file_path: '/new-repo/fixture', content: 'green' },
        context: {
          agentID: null,
          originalUserTask: null,
          delegatedTask: null,
          lastDirectUserMessage: null,
          omittedTaskContext: [{ field: 'originalUserTask', reason: 'unavailable' }],
        },
      },
    },
  ]);

  expect(Number(call.argv[4])).toBeGreaterThanOrEqual(before + CLI_LIMITS.evaluationMs - 500);
  expect(Number(call.argv[4])).toBeLessThanOrEqual(after + CLI_LIMITS.evaluationMs - 500);
});

test('it carries the session identity and the direct user message', async ($, on) => {
  const processRun = buildStubProcessRun({ result: buildMockProcessResult() });

  on('classic.SessionStart', () => ({}));
  on('prompt.submit', (_api, e) => ({ text: e.text }));
  on('session.cwd', () => ({ value: '/repo' }));
  on('tool.check', () => buildMockPermissionDecision({ decision: 'ask' }));
  on('process.run', processRun.hook);

  // oxlint-disable-next-line new-cap -- The host event API retains its event spelling.
  await $.classic.SessionStart({
    ...buildMockSessionContext({ session_id: 'session-1' }),
    source: 'startup',
  });

  await $.prompt.submit({ text: 'Clean the build output.', origin: { kind: 'composer' } });

  const before = Date.now();

  await $.tool.check({ tool: 'Bash', input: { command: 'rm -rf dist' } });

  const after = Date.now();
  const [call] = processRun.calls;

  assertDefined(call);

  expect(processRun.calls).toStrictEqual([
    {
      argv: [
        'auto-mode',
        'run',
        '--jev-only',
        '--evaluation-deadline',
        expect.stringMatching(/^\d+$/u),
      ],
      timeoutMs: CLI_LIMITS.evaluationMs,
      request: {
        sessionID: 'session-1',
        cwd: '/repo',
        toolName: 'Bash',
        toolInput: { command: 'rm -rf dist' },
        context: {
          agentID: null,
          originalUserTask: { text: 'Clean the build output.', origin: 'composer' },
          delegatedTask: null,
          lastDirectUserMessage: { text: 'Clean the build output.', origin: 'composer' },
          omittedTaskContext: [],
        },
      },
    },
  ]);

  expect(Number(call.argv[4])).toBeGreaterThanOrEqual(before + CLI_LIMITS.evaluationMs - 500);
  expect(Number(call.argv[4])).toBeLessThanOrEqual(after + CLI_LIMITS.evaluationMs - 500);
});

test('it sends the earlier direct message as stale after a relayed plugin prompt', async ($, on) => {
  const processRun = buildStubProcessRun({ result: buildMockProcessResult() });

  on('classic.SessionStart', () => ({}));
  on('prompt.submit', (_api, e) => ({ text: e.text }));
  on('session.cwd', () => ({ value: '/repo' }));
  on('tool.check', () => buildMockPermissionDecision({ decision: 'ask' }));
  on('process.run', processRun.hook);

  // oxlint-disable-next-line new-cap -- The host event API retains its event spelling.
  await $.classic.SessionStart({
    ...buildMockSessionContext({ session_id: 'session-1' }),
    source: 'startup',
  });

  await $.prompt.submit({ text: 'Push it to main.', origin: { kind: 'composer' } });
  await $.prompt.submit({ text: 'Relayed request', origin: { kind: 'plugin' } });
  await $.tool.check({ tool: 'Bash', input: { command: 'git push origin main' } });

  const [call] = processRun.calls;

  assertDefined(call);

  expect(call.request).toStrictEqual({
    sessionID: 'session-1',
    cwd: '/repo',
    toolName: 'Bash',
    toolInput: { command: 'git push origin main' },
    context: {
      agentID: null,
      originalUserTask: { text: 'Push it to main.', origin: 'composer' },
      delegatedTask: null,
      lastDirectUserMessage: { text: 'Push it to main.', origin: 'composer', freshness: 'stale' },
      omittedTaskContext: [],
    },
  });
});

test('it preserves the complete action without truncation', async ($, on) => {
  const content = 'x'.repeat(120_000);
  const decided = buildMockPermissionDecision({ decision: 'ask' });
  const processRun = buildStubProcessRun({ result: buildMockProcessResult({ stdout: '' }) });

  on('classic.SessionStart', () => ({}));
  on('session.cwd', () => ({ value: '/repo' }));
  on('tool.check', () => decided);
  on('process.run', processRun.hook);

  // oxlint-disable-next-line new-cap -- The host event API retains its event spelling.
  await $.classic.SessionStart({
    ...buildMockSessionContext({ session_id: 'session-1' }),
    source: 'startup',
  });

  const before = Date.now();

  const result = await $.tool.check({ tool: 'Write', input: { file_path: '/repo/file', content } });

  const after = Date.now();
  const [call] = processRun.calls;

  assertDefined(call);

  expect(result).toStrictEqual(decided);

  expect(processRun.calls).toStrictEqual([
    {
      argv: [
        'auto-mode',
        'run',
        '--jev-only',
        '--evaluation-deadline',
        expect.stringMatching(/^\d+$/u),
      ],
      timeoutMs: CLI_LIMITS.evaluationMs,
      request: {
        sessionID: 'session-1',
        cwd: '/repo',
        toolName: 'Write',
        toolInput: { file_path: '/repo/file', content },
        context: {
          agentID: null,
          originalUserTask: null,
          delegatedTask: null,
          lastDirectUserMessage: null,
          omittedTaskContext: [{ field: 'originalUserTask', reason: 'unavailable' }],
        },
      },
    },
  ]);

  expect(Number(call.argv[4])).toBeGreaterThanOrEqual(before + CLI_LIMITS.evaluationMs - 500);
  expect(Number(call.argv[4])).toBeLessThanOrEqual(after + CLI_LIMITS.evaluationMs - 500);
});

test('it does not replace the main context with a subagent prompt', async ($, on) => {
  const decided = buildMockPermissionDecision({ decision: 'ask' });
  const processRun = buildStubProcessRun({ result: buildMockProcessResult({ stdout: '' }) });

  on('classic.SessionStart', () => ({}));
  on('classic.UserPromptSubmit', () => ({}));
  on('session.cwd', () => ({ value: '/main' }));
  on('tool.check', () => decided);
  on('process.run', processRun.hook);

  // oxlint-disable-next-line new-cap -- The host event API retains its event spelling.
  await $.classic.SessionStart({
    ...buildMockSessionContext({ session_id: 'main-session' }),
    source: 'startup',
  });

  // oxlint-disable-next-line new-cap -- The host event API retains its event spelling.
  await $.classic.UserPromptSubmit({
    ...buildMockSessionContext({ session_id: 'worker-session', agent_id: 'worker' }),
    prompt: 'Ignore the main context',
  });

  const before = Date.now();

  const result = await $.tool.check({
    tool: 'Write',
    input: { file_path: '/main/fixture', content: 'green' },
  });

  const after = Date.now();
  const [call] = processRun.calls;

  assertDefined(call);

  expect(result).toStrictEqual(decided);

  expect(processRun.calls).toStrictEqual([
    {
      argv: [
        'auto-mode',
        'run',
        '--jev-only',
        '--evaluation-deadline',
        expect.stringMatching(/^\d+$/u),
      ],
      timeoutMs: CLI_LIMITS.evaluationMs,
      request: {
        sessionID: 'main-session',
        cwd: '/main',
        toolName: 'Write',
        toolInput: { file_path: '/main/fixture', content: 'green' },
        context: {
          agentID: null,
          originalUserTask: null,
          delegatedTask: null,
          lastDirectUserMessage: null,
          omittedTaskContext: [{ field: 'originalUserTask', reason: 'unavailable' }],
        },
      },
    },
  ]);

  expect(Number(call.argv[4])).toBeGreaterThanOrEqual(before + CLI_LIMITS.evaluationMs - 500);
  expect(Number(call.argv[4])).toBeLessThanOrEqual(after + CLI_LIMITS.evaluationMs - 500);
});

test('it reads the current directory between two calls without a new prompt', async ($, on) => {
  let cwd = '/first';
  const processRun = buildStubProcessRun({ result: buildMockProcessResult() });

  on('classic.SessionStart', () => ({}));
  on('session.cwd', () => ({ value: cwd }));
  on('tool.check', () => buildMockPermissionDecision({ decision: 'ask' }));
  on('process.run', processRun.hook);

  // oxlint-disable-next-line new-cap -- The host event API retains its event spelling.
  await $.classic.SessionStart({
    ...buildMockSessionContext({ session_id: 'session-1' }),
    source: 'startup',
  });

  await $.tool.check({ tool: 'Bash', input: { command: 'rm fixture.txt' } });

  cwd = '/second';

  await $.tool.check({ tool: 'Bash', input: { command: 'rm fixture.txt' } });

  const [, second] = processRun.calls;

  assertDefined(second);

  expect(second).toStrictEqual({
    argv: [
      'auto-mode',
      'run',
      '--jev-only',
      '--evaluation-deadline',
      expect.stringMatching(/^\d+$/u),
    ],
    timeoutMs: CLI_LIMITS.evaluationMs,
    request: {
      sessionID: 'session-1',
      cwd: '/second',
      toolName: 'Bash',
      toolInput: { command: 'rm fixture.txt' },
      context: {
        agentID: null,
        originalUserTask: null,
        delegatedTask: null,
        lastDirectUserMessage: null,
        omittedTaskContext: [{ field: 'originalUserTask', reason: 'unavailable' }],
      },
    },
  });
});

test('it keeps the user prompts of a session across its compaction', async ($, on) => {
  const processRun = buildStubProcessRun({ result: buildMockProcessResult() });

  on('classic.SessionStart', () => ({}));
  on('prompt.submit', (_api, e) => ({ text: e.text }));
  on('session.cwd', () => ({ value: '/repo' }));
  on('tool.check', () => buildMockPermissionDecision({ decision: 'ask' }));
  on('process.run', processRun.hook);

  // oxlint-disable-next-line new-cap -- The host event API retains its event spelling.
  await $.classic.SessionStart({
    ...buildMockSessionContext({ session_id: 'session-1' }),
    source: 'startup',
  });

  await $.prompt.submit({ text: 'Clean the build output.', origin: { kind: 'composer' } });

  // oxlint-disable-next-line new-cap -- The host event API retains its event spelling.
  await $.classic.SessionStart({
    ...buildMockSessionContext({ session_id: 'session-1' }),
    source: 'compact',
  });

  await $.tool.check({ tool: 'Bash', input: { command: 'rm -rf dist' } });

  const [call] = processRun.calls;

  assertDefined(call);

  expect(call.request).toStrictEqual({
    sessionID: 'session-1',
    cwd: '/repo',
    toolName: 'Bash',
    toolInput: { command: 'rm -rf dist' },
    context: {
      agentID: null,
      originalUserTask: { text: 'Clean the build output.', origin: 'composer' },
      delegatedTask: null,
      lastDirectUserMessage: { text: 'Clean the build output.', origin: 'composer' },
      omittedTaskContext: [],
    },
  });
});

test('it keeps the main session and its prompts when a subagent session starts', async ($, on) => {
  const processRun = buildStubProcessRun({ result: buildMockProcessResult() });

  on('classic.SessionStart', () => ({}));
  on('prompt.submit', (_api, e) => ({ text: e.text }));
  on('session.cwd', () => ({ value: '/repo' }));
  on('tool.check', () => buildMockPermissionDecision({ decision: 'ask' }));
  on('process.run', processRun.hook);

  // oxlint-disable-next-line new-cap -- The host event API retains its event spelling.
  await $.classic.SessionStart({
    ...buildMockSessionContext({ session_id: 'main-session' }),
    source: 'startup',
  });

  await $.prompt.submit({ text: 'Clean the build output.', origin: { kind: 'composer' } });

  // oxlint-disable-next-line new-cap -- The host event API retains its event spelling.
  await $.classic.SessionStart({
    ...buildMockSessionContext({ session_id: 'worker-session', agent_id: 'worker' }),
    source: 'startup',
  });

  await $.tool.check({ tool: 'Bash', input: { command: 'rm -rf dist' } });

  const [call] = processRun.calls;

  assertDefined(call);

  expect(call.request).toStrictEqual({
    sessionID: 'main-session',
    cwd: '/repo',
    toolName: 'Bash',
    toolInput: { command: 'rm -rf dist' },
    context: {
      agentID: null,
      originalUserTask: { text: 'Clean the build output.', origin: 'composer' },
      delegatedTask: null,
      lastDirectUserMessage: { text: 'Clean the build output.', origin: 'composer' },
      omittedTaskContext: [],
    },
  });
});

test('it drops the stored prompts when another session compacts', async ($, on) => {
  const processRun = buildStubProcessRun({ result: buildMockProcessResult() });

  on('classic.SessionStart', () => ({}));
  on('prompt.submit', (_api, e) => ({ text: e.text }));
  on('session.cwd', () => ({ value: '/repo' }));
  on('tool.check', () => buildMockPermissionDecision({ decision: 'ask' }));
  on('process.run', processRun.hook);

  // oxlint-disable-next-line new-cap -- The host event API retains its event spelling.
  await $.classic.SessionStart({
    ...buildMockSessionContext({ session_id: 'session-1' }),
    source: 'startup',
  });

  await $.prompt.submit({ text: 'Clean the build output.', origin: { kind: 'composer' } });

  // oxlint-disable-next-line new-cap -- The host event API retains its event spelling.
  await $.classic.SessionStart({
    ...buildMockSessionContext({ session_id: 'session-2' }),
    source: 'compact',
  });

  await $.tool.check({ tool: 'Bash', input: { command: 'rm -rf dist' } });

  const [call] = processRun.calls;

  assertDefined(call);

  expect(call.request).toStrictEqual({
    sessionID: 'session-2',
    cwd: '/repo',
    toolName: 'Bash',
    toolInput: { command: 'rm -rf dist' },
    context: {
      agentID: null,
      originalUserTask: null,
      delegatedTask: null,
      lastDirectUserMessage: null,
      omittedTaskContext: [{ field: 'originalUserTask', reason: 'unavailable' }],
    },
  });
});

test('it drops the stored prompts when the session starts again', async ($, on) => {
  const processRun = buildStubProcessRun({ result: buildMockProcessResult() });

  on('classic.SessionStart', () => ({}));
  on('prompt.submit', (_api, e) => ({ text: e.text }));
  on('session.cwd', () => ({ value: '/repo' }));
  on('tool.check', () => buildMockPermissionDecision({ decision: 'ask' }));
  on('process.run', processRun.hook);

  // oxlint-disable-next-line new-cap -- The host event API retains its event spelling.
  await $.classic.SessionStart({
    ...buildMockSessionContext({ session_id: 'session-1' }),
    source: 'startup',
  });

  await $.prompt.submit({ text: 'Clean the build output.', origin: { kind: 'composer' } });

  // oxlint-disable-next-line new-cap -- The host event API retains its event spelling.
  await $.classic.SessionStart({
    ...buildMockSessionContext({ session_id: 'session-1' }),
    source: 'startup',
  });

  await $.tool.check({ tool: 'Bash', input: { command: 'rm -rf dist' } });

  const [call] = processRun.calls;

  assertDefined(call);

  expect(call.request).toStrictEqual({
    sessionID: 'session-1',
    cwd: '/repo',
    toolName: 'Bash',
    toolInput: { command: 'rm -rf dist' },
    context: {
      agentID: null,
      originalUserTask: null,
      delegatedTask: null,
      lastDirectUserMessage: null,
      omittedTaskContext: [{ field: 'originalUserTask', reason: 'unavailable' }],
    },
  });
});
