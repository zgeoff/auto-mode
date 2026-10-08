import { expect, mock, test } from 'claude-code/testing';
import { buildStubProcessRun } from './test-utils/build-stub-process-run.ts';
import { buildMockCallResult } from './test-utils/factories/build-mock-call-result.ts';
import { buildMockPermissionDecision } from './test-utils/factories/build-mock-permission-decision.ts';
import { buildMockProcessResult } from './test-utils/factories/build-mock-process-result.ts';

test('it preserves an existing denial and its rule', async ($, on) => {
  const decided = buildMockPermissionDecision({ decision: 'deny' });

  const processRun = buildStubProcessRun({
    result: buildMockProcessResult({ stdout: '{"decision":"allow"}' }),
  });

  mock.clock(on, { now: 1_000_000 });

  on('session.cwd', () => ({ value: '/repo' }));
  on('tool.check', () => decided);
  on('classic.SessionStart', () => ({}));
  on('process.run', processRun.hook);

  // oxlint-disable-next-line new-cap -- The host event API retains its event spelling.
  await $.classic.SessionStart({
    source: 'startup',
    session_id: 'session-1',
    cwd: '/repo',
    transcript_path: '/repo/transcript.jsonl',
  });

  const result = await $.tool.check({
    tool: 'Bash',
    input: { command: 'git push origin feature', timeout: 120_000 },
  });

  expect(result).toStrictEqual(decided);
  expect(processRun.calls).toStrictEqual([]);
});

test('it preserves an existing allowance without a second evaluator', async ($, on) => {
  const decided = buildMockPermissionDecision({ decision: 'allow' });

  const processRun = buildStubProcessRun({
    result: buildMockProcessResult({
      stdout: '{"decision":"deny","reason":"[Data Exfiltration] Refuse the transfer."}',
    }),
  });

  mock.clock(on, { now: 1_000_000 });

  on('session.cwd', () => ({ value: '/repo' }));
  on('tool.check', () => decided);
  on('classic.SessionStart', () => ({}));
  on('process.run', processRun.hook);

  // oxlint-disable-next-line new-cap -- The host event API retains its event spelling.
  await $.classic.SessionStart({
    source: 'startup',
    session_id: 'session-1',
    cwd: '/repo',
    transcript_path: '/repo/transcript.jsonl',
  });

  const result = await $.tool.check({
    tool: 'Bash',
    input: { command: 'git push origin feature', timeout: 120_000 },
  });

  expect(result).toStrictEqual(decided);
  expect(processRun.calls).toStrictEqual([]);
});

test('it approves an ask after Jev allows the action', async ($, on) => {
  const decided = buildMockPermissionDecision();

  const processRun = buildStubProcessRun({
    result: buildMockProcessResult({ stdout: '{"decision":"allow"}' }),
  });

  mock.clock(on, { now: 1_000_000 });

  on('session.cwd', () => ({ value: '/repo' }));
  on('tool.check', () => decided);
  on('classic.SessionStart', () => ({}));
  on('process.run', processRun.hook);

  // oxlint-disable-next-line new-cap -- The host event API retains its event spelling.
  await $.classic.SessionStart({
    source: 'startup',
    session_id: 'session-1',
    cwd: '/repo',
    transcript_path: '/repo/transcript.jsonl',
  });

  const result = await $.tool.check({
    tool: 'Bash',
    input: { command: 'git push origin feature', timeout: 120_000 },
  });

  expect(result).toStrictEqual({ decision: 'allow' });

  expect(processRun.calls).toStrictEqual([
    {
      argv: ['auto-mode', 'run', '--jev-only', '--evaluation-deadline', '1007500'],
      timeoutMs: 8000,
      request: {
        sessionID: 'session-1',
        cwd: '/repo',
        toolName: 'Bash',
        toolInput: { command: 'git push origin feature', timeout: 120_000 },
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
});

test('it refuses an ask after Jev denies the action', async ($, on) => {
  const decided = buildMockPermissionDecision();

  const processRun = buildStubProcessRun({
    result: buildMockProcessResult({
      stdout: '{"decision":"deny","reason":"[Data Exfiltration] Refuse the transfer."}',
    }),
  });

  mock.clock(on, { now: 1_000_000 });

  on('session.cwd', () => ({ value: '/repo' }));
  on('tool.check', () => decided);
  on('classic.SessionStart', () => ({}));
  on('process.run', processRun.hook);

  // oxlint-disable-next-line new-cap -- The host event API retains its event spelling.
  await $.classic.SessionStart({
    source: 'startup',
    session_id: 'session-1',
    cwd: '/repo',
    transcript_path: '/repo/transcript.jsonl',
  });

  const result = await $.tool.check({
    tool: 'Bash',
    input: { command: 'git push origin feature', timeout: 120_000 },
  });

  expect(result).toStrictEqual({
    decision: 'deny',
    reason: '[Data Exfiltration] Refuse the transfer.',
  });

  expect(processRun.calls).toStrictEqual([
    {
      argv: ['auto-mode', 'run', '--jev-only', '--evaluation-deadline', '1007500'],
      timeoutMs: 8000,
      request: {
        sessionID: 'session-1',
        cwd: '/repo',
        toolName: 'Bash',
        toolInput: { command: 'git push origin feature', timeout: 120_000 },
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
});

test('it retains manual approval when Jev returns no opinion', async ($, on) => {
  const decided = buildMockPermissionDecision();
  const processRun = buildStubProcessRun({ result: buildMockProcessResult({ stdout: '' }) });

  mock.clock(on, { now: 1_000_000 });

  on('session.cwd', () => ({ value: '/repo' }));
  on('tool.check', () => decided);
  on('classic.SessionStart', () => ({}));
  on('process.run', processRun.hook);

  // oxlint-disable-next-line new-cap -- The host event API retains its event spelling.
  await $.classic.SessionStart({
    source: 'startup',
    session_id: 'session-1',
    cwd: '/repo',
    transcript_path: '/repo/transcript.jsonl',
  });

  const result = await $.tool.check({
    tool: 'Bash',
    input: { command: 'git push origin feature', timeout: 120_000 },
  });

  expect(result).toStrictEqual(decided);

  expect(processRun.calls).toStrictEqual([
    {
      argv: ['auto-mode', 'run', '--jev-only', '--evaluation-deadline', '1007500'],
      timeoutMs: 8000,
      request: {
        sessionID: 'session-1',
        cwd: '/repo',
        toolName: 'Bash',
        toolInput: { command: 'git push origin feature', timeout: 120_000 },
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
});

test('it retains manual approval for malformed JSON without copying diagnostics', async ($, on) => {
  const decided = buildMockPermissionDecision();

  const processRun = buildStubProcessRun({
    result: buildMockProcessResult({ stdout: 'not-json synthetic-private-fragment' }),
  });

  mock.clock(on, { now: 1_000_000 });

  on('session.cwd', () => ({ value: '/repo' }));
  on('tool.check', () => decided);
  on('classic.SessionStart', () => ({}));
  on('process.run', processRun.hook);

  // oxlint-disable-next-line new-cap -- The host event API retains its event spelling.
  await $.classic.SessionStart({
    source: 'startup',
    session_id: 'session-1',
    cwd: '/repo',
    transcript_path: '/repo/transcript.jsonl',
  });

  const result = await $.tool.check({
    tool: 'Bash',
    input: { command: 'git push origin feature', timeout: 120_000 },
  });

  expect(result).toStrictEqual(decided);

  expect(processRun.calls).toStrictEqual([
    {
      argv: ['auto-mode', 'run', '--jev-only', '--evaluation-deadline', '1007500'],
      timeoutMs: 8000,
      request: {
        sessionID: 'session-1',
        cwd: '/repo',
        toolName: 'Bash',
        toolInput: { command: 'git push origin feature', timeout: 120_000 },
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
});

test('it retains manual approval for a hook-shaped verdict', async ($, on) => {
  const decided = buildMockPermissionDecision();

  const processRun = buildStubProcessRun({
    result: buildMockProcessResult({
      stdout: '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"allow"}}',
    }),
  });

  mock.clock(on, { now: 1_000_000 });

  on('session.cwd', () => ({ value: '/repo' }));
  on('tool.check', () => decided);
  on('classic.SessionStart', () => ({}));
  on('process.run', processRun.hook);

  // oxlint-disable-next-line new-cap -- The host event API retains its event spelling.
  await $.classic.SessionStart({
    source: 'startup',
    session_id: 'session-1',
    cwd: '/repo',
    transcript_path: '/repo/transcript.jsonl',
  });

  const result = await $.tool.check({
    tool: 'Bash',
    input: { command: 'git push origin feature', timeout: 120_000 },
  });

  expect(result).toStrictEqual(decided);

  expect(processRun.calls).toStrictEqual([
    {
      argv: ['auto-mode', 'run', '--jev-only', '--evaluation-deadline', '1007500'],
      timeoutMs: 8000,
      request: {
        sessionID: 'session-1',
        cwd: '/repo',
        toolName: 'Bash',
        toolInput: { command: 'git push origin feature', timeout: 120_000 },
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
});

test('it retains manual approval for an allowance whose reason is not text', async ($, on) => {
  const decided = buildMockPermissionDecision();

  const processRun = buildStubProcessRun({
    result: buildMockProcessResult({ stdout: '{"decision":"allow","reason":123}' }),
  });

  mock.clock(on, { now: 1_000_000 });

  on('session.cwd', () => ({ value: '/repo' }));
  on('tool.check', () => decided);
  on('classic.SessionStart', () => ({}));
  on('process.run', processRun.hook);

  // oxlint-disable-next-line new-cap -- The host event API retains its event spelling.
  await $.classic.SessionStart({
    source: 'startup',
    session_id: 'session-1',
    cwd: '/repo',
    transcript_path: '/repo/transcript.jsonl',
  });

  const result = await $.tool.check({
    tool: 'Bash',
    input: { command: 'git push origin feature', timeout: 120_000 },
  });

  expect(result).toStrictEqual(decided);

  expect(processRun.calls).toStrictEqual([
    {
      argv: ['auto-mode', 'run', '--jev-only', '--evaluation-deadline', '1007500'],
      timeoutMs: 8000,
      request: {
        sessionID: 'session-1',
        cwd: '/repo',
        toolName: 'Bash',
        toolInput: { command: 'git push origin feature', timeout: 120_000 },
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
});

test('it retains manual approval for an allowance with an unknown field', async ($, on) => {
  const decided = buildMockPermissionDecision();

  const processRun = buildStubProcessRun({
    result: buildMockProcessResult({ stdout: '{"decision":"allow","rule":"Read-only actions"}' }),
  });

  mock.clock(on, { now: 1_000_000 });

  on('session.cwd', () => ({ value: '/repo' }));
  on('tool.check', () => decided);
  on('classic.SessionStart', () => ({}));
  on('process.run', processRun.hook);

  // oxlint-disable-next-line new-cap -- The host event API retains its event spelling.
  await $.classic.SessionStart({
    source: 'startup',
    session_id: 'session-1',
    cwd: '/repo',
    transcript_path: '/repo/transcript.jsonl',
  });

  const result = await $.tool.check({
    tool: 'Bash',
    input: { command: 'git push origin feature', timeout: 120_000 },
  });

  expect(result).toStrictEqual(decided);

  expect(processRun.calls).toStrictEqual([
    {
      argv: ['auto-mode', 'run', '--jev-only', '--evaluation-deadline', '1007500'],
      timeoutMs: 8000,
      request: {
        sessionID: 'session-1',
        cwd: '/repo',
        toolName: 'Bash',
        toolInput: { command: 'git push origin feature', timeout: 120_000 },
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
});

test('it retains manual approval for a denial with an unknown field', async ($, on) => {
  const decided = buildMockPermissionDecision();

  const processRun = buildStubProcessRun({
    result: buildMockProcessResult({
      stdout:
        '{"decision":"deny","reason":"[Data Exfiltration] Refuse the transfer.","extra":true}',
    }),
  });

  mock.clock(on, { now: 1_000_000 });

  on('session.cwd', () => ({ value: '/repo' }));
  on('tool.check', () => decided);
  on('classic.SessionStart', () => ({}));
  on('process.run', processRun.hook);

  // oxlint-disable-next-line new-cap -- The host event API retains its event spelling.
  await $.classic.SessionStart({
    source: 'startup',
    session_id: 'session-1',
    cwd: '/repo',
    transcript_path: '/repo/transcript.jsonl',
  });

  const result = await $.tool.check({
    tool: 'Bash',
    input: { command: 'git push origin feature', timeout: 120_000 },
  });

  expect(result).toStrictEqual(decided);

  expect(processRun.calls).toStrictEqual([
    {
      argv: ['auto-mode', 'run', '--jev-only', '--evaluation-deadline', '1007500'],
      timeoutMs: 8000,
      request: {
        sessionID: 'session-1',
        cwd: '/repo',
        toolName: 'Bash',
        toolInput: { command: 'git push origin feature', timeout: 120_000 },
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
});

test('it retains manual approval for a denial whose reason is not text', async ($, on) => {
  const decided = buildMockPermissionDecision();

  const processRun = buildStubProcessRun({
    result: buildMockProcessResult({ stdout: '{"decision":"deny","reason":42}' }),
  });

  mock.clock(on, { now: 1_000_000 });

  on('session.cwd', () => ({ value: '/repo' }));
  on('tool.check', () => decided);
  on('classic.SessionStart', () => ({}));
  on('process.run', processRun.hook);

  // oxlint-disable-next-line new-cap -- The host event API retains its event spelling.
  await $.classic.SessionStart({
    source: 'startup',
    session_id: 'session-1',
    cwd: '/repo',
    transcript_path: '/repo/transcript.jsonl',
  });

  const result = await $.tool.check({
    tool: 'Bash',
    input: { command: 'git push origin feature', timeout: 120_000 },
  });

  expect(result).toStrictEqual(decided);

  expect(processRun.calls).toStrictEqual([
    {
      argv: ['auto-mode', 'run', '--jev-only', '--evaluation-deadline', '1007500'],
      timeoutMs: 8000,
      request: {
        sessionID: 'session-1',
        cwd: '/repo',
        toolName: 'Bash',
        toolInput: { command: 'git push origin feature', timeout: 120_000 },
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
});

test('it retains manual approval for a verdict that is an array', async ($, on) => {
  const decided = buildMockPermissionDecision();

  const processRun = buildStubProcessRun({
    result: buildMockProcessResult({ stdout: '["allow"]' }),
  });

  mock.clock(on, { now: 1_000_000 });

  on('session.cwd', () => ({ value: '/repo' }));
  on('tool.check', () => decided);
  on('classic.SessionStart', () => ({}));
  on('process.run', processRun.hook);

  // oxlint-disable-next-line new-cap -- The host event API retains its event spelling.
  await $.classic.SessionStart({
    source: 'startup',
    session_id: 'session-1',
    cwd: '/repo',
    transcript_path: '/repo/transcript.jsonl',
  });

  const result = await $.tool.check({
    tool: 'Bash',
    input: { command: 'git push origin feature', timeout: 120_000 },
  });

  expect(result).toStrictEqual(decided);

  expect(processRun.calls).toStrictEqual([
    {
      argv: ['auto-mode', 'run', '--jev-only', '--evaluation-deadline', '1007500'],
      timeoutMs: 8000,
      request: {
        sessionID: 'session-1',
        cwd: '/repo',
        toolName: 'Bash',
        toolInput: { command: 'git push origin feature', timeout: 120_000 },
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
});

test('it retains manual approval for a malformed denial', async ($, on) => {
  const decided = buildMockPermissionDecision();

  const processRun = buildStubProcessRun({
    result: buildMockProcessResult({ stdout: '{"decision":"deny"}' }),
  });

  mock.clock(on, { now: 1_000_000 });

  on('session.cwd', () => ({ value: '/repo' }));
  on('tool.check', () => decided);
  on('classic.SessionStart', () => ({}));
  on('process.run', processRun.hook);

  // oxlint-disable-next-line new-cap -- The host event API retains its event spelling.
  await $.classic.SessionStart({
    source: 'startup',
    session_id: 'session-1',
    cwd: '/repo',
    transcript_path: '/repo/transcript.jsonl',
  });

  const result = await $.tool.check({
    tool: 'Bash',
    input: { command: 'git push origin feature', timeout: 120_000 },
  });

  expect(result).toStrictEqual(decided);

  expect(processRun.calls).toStrictEqual([
    {
      argv: ['auto-mode', 'run', '--jev-only', '--evaluation-deadline', '1007500'],
      timeoutMs: 8000,
      request: {
        sessionID: 'session-1',
        cwd: '/repo',
        toolName: 'Bash',
        toolInput: { command: 'git push origin feature', timeout: 120_000 },
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
});

test('it retains manual approval for a truncated response', async ($, on) => {
  const decided = buildMockPermissionDecision();

  const processRun = buildStubProcessRun({
    result: buildMockProcessResult({ stdout: '{"decision":"allow"}', isStdoutTruncated: true }),
  });

  mock.clock(on, { now: 1_000_000 });

  on('session.cwd', () => ({ value: '/repo' }));
  on('tool.check', () => decided);
  on('classic.SessionStart', () => ({}));
  on('process.run', processRun.hook);

  // oxlint-disable-next-line new-cap -- The host event API retains its event spelling.
  await $.classic.SessionStart({
    source: 'startup',
    session_id: 'session-1',
    cwd: '/repo',
    transcript_path: '/repo/transcript.jsonl',
  });

  const result = await $.tool.check({
    tool: 'Bash',
    input: { command: 'git push origin feature', timeout: 120_000 },
  });

  expect(result).toStrictEqual(decided);

  expect(processRun.calls).toStrictEqual([
    {
      argv: ['auto-mode', 'run', '--jev-only', '--evaluation-deadline', '1007500'],
      timeoutMs: 8000,
      request: {
        sessionID: 'session-1',
        cwd: '/repo',
        toolName: 'Bash',
        toolInput: { command: 'git push origin feature', timeout: 120_000 },
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
});

test('it retains manual approval when the child exits nonzero', async ($, on) => {
  const decided = buildMockPermissionDecision();

  const processRun = buildStubProcessRun({
    result: buildMockProcessResult({ exitCode: 1, stdout: '{"decision":"allow"}' }),
  });

  mock.clock(on, { now: 1_000_000 });

  on('session.cwd', () => ({ value: '/repo' }));
  on('tool.check', () => decided);
  on('classic.SessionStart', () => ({}));
  on('process.run', processRun.hook);

  // oxlint-disable-next-line new-cap -- The host event API retains its event spelling.
  await $.classic.SessionStart({
    source: 'startup',
    session_id: 'session-1',
    cwd: '/repo',
    transcript_path: '/repo/transcript.jsonl',
  });

  const result = await $.tool.check({
    tool: 'Bash',
    input: { command: 'git push origin feature', timeout: 120_000 },
  });

  expect(result).toStrictEqual(decided);

  expect(processRun.calls).toStrictEqual([
    {
      argv: ['auto-mode', 'run', '--jev-only', '--evaluation-deadline', '1007500'],
      timeoutMs: 8000,
      request: {
        sessionID: 'session-1',
        cwd: '/repo',
        toolName: 'Bash',
        toolInput: { command: 'git push origin feature', timeout: 120_000 },
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
});

test('it retains manual approval when the child times out', async ($, on) => {
  const decided = buildMockPermissionDecision();

  const processRun = buildStubProcessRun({
    failure: 'synthetic child timeout; private diagnostics',
  });

  mock.clock(on, { now: 1_000_000 });

  on('session.cwd', () => ({ value: '/repo' }));
  on('tool.check', () => decided);
  on('classic.SessionStart', () => ({}));
  on('process.run', processRun.hook);

  // oxlint-disable-next-line new-cap -- The host event API retains its event spelling.
  await $.classic.SessionStart({
    source: 'startup',
    session_id: 'session-1',
    cwd: '/repo',
    transcript_path: '/repo/transcript.jsonl',
  });

  const result = await $.tool.check({
    tool: 'Bash',
    input: { command: 'git push origin feature', timeout: 120_000 },
  });

  expect(result).toStrictEqual(decided);

  expect(processRun.calls).toStrictEqual([
    {
      argv: ['auto-mode', 'run', '--jev-only', '--evaluation-deadline', '1007500'],
      timeoutMs: 8000,
      request: {
        sessionID: 'session-1',
        cwd: '/repo',
        toolName: 'Bash',
        toolInput: { command: 'git push origin feature', timeout: 120_000 },
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
});

test('it retains manual approval before the session context arrives', async ($, on) => {
  const decided = buildMockPermissionDecision();

  const processRun = buildStubProcessRun({
    result: buildMockProcessResult({ stdout: '{"decision":"allow"}' }),
  });

  mock.clock(on, { now: 1_000_000 });

  on('session.cwd', () => ({ value: '/repo' }));
  on('tool.check', () => decided);
  on('process.run', processRun.hook);

  const result = await $.tool.check({
    tool: 'Bash',
    input: { command: 'git push origin feature', timeout: 120_000 },
  });

  expect(result).toStrictEqual(decided);
  expect(processRun.calls).toStrictEqual([]);
});

test(
  'it passes a configured executable as one argument without a shell',
  { options: { command: '/opt/auto mode/bin/auto-mode' } },
  async ($, on) => {
    const processRun = buildStubProcessRun({
      result: buildMockProcessResult({ stdout: '{"decision":"allow"}' }),
    });

    mock.clock(on, { now: 1_000_000 });

    on('session.cwd', () => ({ value: '/repo' }));
    on('tool.check', () => buildMockPermissionDecision());
    on('classic.SessionStart', () => ({}));
    on('process.run', processRun.hook);

    // oxlint-disable-next-line new-cap -- The host event API retains its event spelling.
    await $.classic.SessionStart({
      source: 'startup',
      session_id: 'session-1',
      cwd: '/repo',
      transcript_path: '/repo/transcript.jsonl',
    });

    const result = await $.tool.check({
      tool: 'Bash',
      input: { command: 'git push origin feature', timeout: 120_000 },
    });

    expect(result).toStrictEqual({ decision: 'allow' });

    expect(processRun.calls).toStrictEqual([
      {
        argv: [
          '/opt/auto mode/bin/auto-mode',
          'run',
          '--jev-only',
          '--evaluation-deadline',
          '1007500',
        ],
        timeoutMs: 8000,
        request: {
          sessionID: 'session-1',
          cwd: '/repo',
          toolName: 'Bash',
          toolInput: { command: 'git push origin feature', timeout: 120_000 },
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
  },
);

test('it refreshes the context from the current user prompt after reload', async ($, on) => {
  const decided = buildMockPermissionDecision();
  const processRun = buildStubProcessRun({ result: buildMockProcessResult() });

  mock.clock(on, { now: 1_000_000 });

  on('classic.UserPromptSubmit', () => ({}));
  on('session.cwd', () => ({ value: '/new-repo' }));
  on('tool.check', () => decided);
  on('process.run', processRun.hook);

  // oxlint-disable-next-line new-cap -- The host event API retains its event spelling.
  await $.classic.UserPromptSubmit({
    prompt: 'Edit the test fixture.',
    session_id: 'new-session',
    cwd: '/new-repo',
    transcript_path: '/new-repo/current.jsonl',
  });

  const result = await $.tool.check({
    tool: 'Write',
    input: { file_path: '/new-repo/fixture', content: 'green' },
  });

  expect(result).toStrictEqual(decided);

  expect(processRun.calls).toStrictEqual([
    {
      argv: ['auto-mode', 'run', '--jev-only', '--evaluation-deadline', '1007500'],
      timeoutMs: 8000,
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
});

test('it carries the session identity and the direct user message', async ($, on) => {
  const processRun = buildStubProcessRun({ result: buildMockProcessResult() });

  mock.clock(on, { now: 1_000_000 });

  on('classic.SessionStart', () => ({}));
  on('prompt.submit', (_api, e) => ({ text: e.text }));
  on('session.cwd', () => ({ value: '/repo' }));
  on('tool.check', () => buildMockPermissionDecision());
  on('process.run', processRun.hook);

  // oxlint-disable-next-line new-cap -- The host event API retains its event spelling.
  await $.classic.SessionStart({ source: 'startup', session_id: 'session-1', cwd: '/repo' });
  await $.prompt.submit({ text: 'Clean the build output.', origin: { kind: 'composer' } });
  await $.tool.check({ tool: 'Bash', input: { command: 'rm -rf dist' } });

  expect(processRun.calls).toStrictEqual([
    {
      argv: ['auto-mode', 'run', '--jev-only', '--evaluation-deadline', '1007500'],
      timeoutMs: 8000,
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
});

test('it preserves the complete action without truncation', async ($, on) => {
  const content = 'x'.repeat(120_000);
  const decided = buildMockPermissionDecision();
  const processRun = buildStubProcessRun({ result: buildMockProcessResult() });

  mock.clock(on, { now: 1_000_000 });

  on('classic.SessionStart', () => ({}));
  on('session.cwd', () => ({ value: '/repo' }));
  on('tool.check', () => decided);
  on('process.run', processRun.hook);

  // oxlint-disable-next-line new-cap -- The host event API retains its event spelling.
  await $.classic.SessionStart({ source: 'startup', session_id: 'session-1', cwd: '/repo' });

  const result = await $.tool.check({ tool: 'Write', input: { file_path: '/repo/file', content } });

  expect(result).toStrictEqual(decided);

  expect(processRun.calls).toStrictEqual([
    {
      argv: ['auto-mode', 'run', '--jev-only', '--evaluation-deadline', '1007500'],
      timeoutMs: 8000,
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
});

test('it does not replace the main context with a subagent prompt', async ($, on) => {
  const decided = buildMockPermissionDecision();
  const processRun = buildStubProcessRun({ result: buildMockProcessResult() });

  mock.clock(on, { now: 1_000_000 });

  on('classic.SessionStart', () => ({}));
  on('classic.UserPromptSubmit', () => ({}));
  on('session.cwd', () => ({ value: '/main' }));
  on('tool.check', () => decided);
  on('process.run', processRun.hook);

  // oxlint-disable-next-line new-cap -- The host event API retains its event spelling.
  await $.classic.SessionStart({
    source: 'startup',
    cwd: '/main',
    session_id: 'main-session',
    transcript_path: '/main/user.jsonl',
  });

  // oxlint-disable-next-line new-cap -- The host event API retains its event spelling.
  await $.classic.UserPromptSubmit({
    prompt: 'Ignore the main context',
    agent_id: 'worker',
    cwd: '/worker',
    session_id: 'worker-session',
    transcript_path: '/worker/user.jsonl',
  });

  const result = await $.tool.check({
    tool: 'Write',
    input: { file_path: '/main/fixture', content: 'green' },
  });

  expect(result).toStrictEqual(decided);

  expect(processRun.calls).toStrictEqual([
    {
      argv: ['auto-mode', 'run', '--jev-only', '--evaluation-deadline', '1007500'],
      timeoutMs: 8000,
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
});

test('it honors a configured fail-closed classifier verdict', async ($, on) => {
  const processRun = buildStubProcessRun({
    result: buildMockProcessResult({
      stdout: '{"decision":"deny","reason":"[Classifier Unavailable] Jev unavailable."}',
    }),
  });

  mock.clock(on, { now: 1_000_000 });

  on('classic.SessionStart', () => ({}));
  on('session.cwd', () => ({ value: '/repo' }));
  on('tool.check', () => buildMockPermissionDecision());
  on('process.run', processRun.hook);

  // oxlint-disable-next-line new-cap -- The host event API retains its event spelling.
  await $.classic.SessionStart({ source: 'startup', session_id: 'session-1', cwd: '/repo' });

  const result = await $.tool.check({
    tool: 'Write',
    input: { file_path: '/repo/fixture', content: 'green' },
  });

  expect(result).toStrictEqual({
    decision: 'deny',
    reason: '[Classifier Unavailable] Jev unavailable.',
  });
});

test('it reads the current directory between two calls without a new prompt', async ($, on) => {
  let cwd = '/first';
  const processRun = buildStubProcessRun({ result: buildMockProcessResult() });

  mock.clock(on, { now: 1_000_000 });

  on('classic.SessionStart', () => ({}));
  on('session.cwd', () => ({ value: cwd }));
  on('tool.check', () => buildMockPermissionDecision());
  on('process.run', processRun.hook);

  // oxlint-disable-next-line new-cap -- The host event API retains its event spelling.
  await $.classic.SessionStart({ source: 'startup', session_id: 'session-1', cwd: '/first' });
  await $.tool.check({ tool: 'Bash', input: { command: 'rm fixture.txt' } });

  cwd = '/second';

  await $.tool.check({ tool: 'Bash', input: { command: 'rm fixture.txt' } });

  expect(processRun.calls).toStrictEqual([
    {
      argv: ['auto-mode', 'run', '--jev-only', '--evaluation-deadline', '1007500'],
      timeoutMs: 8000,
      request: {
        sessionID: 'session-1',
        cwd: '/first',
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
    },
    {
      argv: ['auto-mode', 'run', '--jev-only', '--evaluation-deadline', '1007500'],
      timeoutMs: 8000,
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
    },
  ]);
});

test('it records invocation and fallback without copying child output or failure text', async ($, on) => {
  const decided = buildMockPermissionDecision();
  const logs: string[] = [];

  mock.clock(on, { now: 1_000_000 });

  on('ui.log', (_api, e) => {
    logs.push(e.text);

    return { value: undefined };
  });

  on('classic.SessionStart', () => ({}));
  on('session.cwd', () => ({ value: '/repo' }));
  on('tool.check', () => decided);

  on(
    'process.run',
    buildStubProcessRun({
      result: buildMockProcessResult({
        stdout: 'private-stdout-canary',
        stderr: 'private-stderr-canary',
      }),
    }).hook,
  );

  // oxlint-disable-next-line new-cap -- The host event API retains its event spelling.
  await $.classic.SessionStart({ source: 'startup', session_id: 'session-1', cwd: '/repo' });

  const result = await $.tool.check({ tool: 'Bash', input: { command: 'private-action-canary' } });

  expect(result).toStrictEqual(decided);

  expect(logs).toStrictEqual([
    'auto-mode action unavailable: evaluator invoked',
    'auto-mode action unavailable: manual approval retained; no usable verdict; inspect action diagnostics',
  ]);
});

test('it identifies a subprocess failure without copying the exception', async ($, on) => {
  const decided = buildMockPermissionDecision();
  const logs: string[] = [];

  mock.clock(on, { now: 1_000_000 });

  on('ui.log', (_api, e) => {
    logs.push(e.text);

    return { value: undefined };
  });

  on('classic.SessionStart', () => ({}));
  on('session.cwd', () => ({ value: '/repo' }));
  on('tool.check', () => decided);

  on(
    'process.run',
    buildStubProcessRun({
      failure: 'private-exception-canary: aborted: still running after 8000ms',
    }).hook,
  );

  // oxlint-disable-next-line new-cap -- The host event API retains its event spelling.
  await $.classic.SessionStart({ source: 'startup', session_id: 'session-1', cwd: '/repo' });

  const result = await $.tool.check({ tool: 'Bash', input: {} });

  expect(result).toStrictEqual(decided);

  expect(logs).toStrictEqual([
    'auto-mode action unavailable: evaluator invoked',
    'auto-mode action unavailable: manual approval retained; subprocess failure',
  ]);
});

test('it records a finished scope-creating Bash call with its result', async ($, on) => {
  const called = buildMockCallResult({
    result: { stdout: 'https://github.com/dev/app/pull/3\n', stderr: '' },
    text: 'https://github.com/dev/app/pull/3\n',
  });

  const processRun = buildStubProcessRun({ result: buildMockProcessResult() });

  mock.clock(on, { now: 1_000_000 });

  on('session.cwd', () => ({ value: '/repo' }));
  on('classic.SessionStart', () => ({}));
  on('tool.call', () => called);
  on('process.run', processRun.hook);

  // oxlint-disable-next-line new-cap -- The host event API retains its event spelling.
  await $.classic.SessionStart({
    source: 'startup',
    session_id: 'session-1',
    cwd: '/repo',
    transcript_path: '/repo/transcript.jsonl',
  });

  const result = await $.tool.call({
    tool: 'Bash',
    tool_use_id: 'call-1',
    command: 'gh pr create --fill',
  });

  expect(result).toStrictEqual(called);

  expect(processRun.calls).toStrictEqual([
    {
      argv: ['auto-mode', 'record'],
      timeoutMs: 8000,
      request: {
        sessionID: 'session-1',
        cwd: '/repo',
        startedAt: 1_000_000,
        command: 'gh pr create --fill',
        resultText: 'https://github.com/dev/app/pull/3\n',
      },
    },
  ]);
});

test('it records nothing for a Bash call that cannot create scope', async ($, on) => {
  const processRun = buildStubProcessRun({ result: buildMockProcessResult() });

  mock.clock(on, { now: 1_000_000 });

  on('session.cwd', () => ({ value: '/repo' }));
  on('classic.SessionStart', () => ({}));
  on('tool.call', () => buildMockCallResult());
  on('process.run', processRun.hook);

  // oxlint-disable-next-line new-cap -- The host event API retains its event spelling.
  await $.classic.SessionStart({
    source: 'startup',
    session_id: 'session-1',
    cwd: '/repo',
    transcript_path: '/repo/transcript.jsonl',
  });

  await $.tool.call({ tool: 'Bash', tool_use_id: 'call-1', command: 'bun test' });

  expect(processRun.calls).toStrictEqual([]);
});

test('it records nothing for a scope-creating Bash call that was denied', async ($, on) => {
  const processRun = buildStubProcessRun({ result: buildMockProcessResult() });

  mock.clock(on, { now: 1_000_000 });

  on('session.cwd', () => ({ value: '/repo' }));
  on('classic.SessionStart', () => ({}));
  on('tool.call', () => ({ deny: 'no' }));
  on('process.run', processRun.hook);

  // oxlint-disable-next-line new-cap -- The host event API retains its event spelling.
  await $.classic.SessionStart({
    source: 'startup',
    session_id: 'session-1',
    cwd: '/repo',
    transcript_path: '/repo/transcript.jsonl',
  });

  await $.tool.call({ tool: 'Bash', tool_use_id: 'call-2', command: 'git checkout -b x' });

  expect(processRun.calls).toStrictEqual([]);
});
