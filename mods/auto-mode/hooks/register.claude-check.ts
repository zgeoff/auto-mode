import { expect, test } from 'claude-code/testing';
import { assertDefined } from './test-utils/assert-defined.ts';
import { buildStubProcessRun } from './test-utils/build-stub-process-run.ts';
import { buildMockCallResult } from './test-utils/factories/build-mock-call-result.ts';
import { buildMockPermissionDecision } from './test-utils/factories/build-mock-permission-decision.ts';
import { buildMockProcessResult } from './test-utils/factories/build-mock-process-result.ts';
import { buildMockSessionContext } from './test-utils/factories/build-mock-session-context.ts';

test('it preserves an existing denial and its rule', async ($, on) => {
  const decided = buildMockPermissionDecision({ decision: 'deny' });

  const processRun = buildStubProcessRun({
    result: buildMockProcessResult({ stdout: '{"decision":"allow"}' }),
  });

  on('session.cwd', () => ({ value: '/repo' }));
  on('tool.check', () => decided);
  on('classic.SessionStart', () => ({}));
  on('process.run', processRun.hook);

  // oxlint-disable-next-line new-cap -- The host event API retains its event spelling.
  await $.classic.SessionStart({ ...buildMockSessionContext(), source: 'startup' });

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

  on('session.cwd', () => ({ value: '/repo' }));
  on('tool.check', () => decided);
  on('classic.SessionStart', () => ({}));
  on('process.run', processRun.hook);

  // oxlint-disable-next-line new-cap -- The host event API retains its event spelling.
  await $.classic.SessionStart({ ...buildMockSessionContext(), source: 'startup' });

  const result = await $.tool.check({
    tool: 'Bash',
    input: { command: 'git push origin feature', timeout: 120_000 },
  });

  expect(result).toStrictEqual(decided);
  expect(processRun.calls).toStrictEqual([]);
});

test('it approves an ask after Jev allows the action', async ($, on) => {
  const decided = buildMockPermissionDecision({ decision: 'ask' });

  const processRun = buildStubProcessRun({
    result: buildMockProcessResult({ stdout: '{"decision":"allow"}' }),
  });

  on('session.cwd', () => ({ value: '/repo' }));
  on('tool.check', () => decided);
  on('classic.SessionStart', () => ({}));
  on('process.run', processRun.hook);

  // oxlint-disable-next-line new-cap -- The host event API retains its event spelling.
  await $.classic.SessionStart({
    ...buildMockSessionContext({ session_id: 'session-1' }),
    source: 'startup',
  });

  const before = Date.now();

  const result = await $.tool.check({
    tool: 'Bash',
    input: { command: 'git push origin feature', timeout: 120_000 },
  });

  const after = Date.now();
  const [call] = processRun.calls;

  assertDefined(call);

  expect(result).toStrictEqual({ decision: 'allow' });

  expect(processRun.calls).toStrictEqual([
    {
      argv: [
        'auto-mode',
        'run',
        '--jev-only',
        '--evaluation-deadline',
        expect.stringMatching(/^\d+$/),
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

  expect(Number(call.argv[4])).toBeGreaterThanOrEqual(before + 7500);
  expect(Number(call.argv[4])).toBeLessThanOrEqual(after + 7500);
});

test('it refuses an ask after Jev denies the action', async ($, on) => {
  const decided = buildMockPermissionDecision({ decision: 'ask' });

  const processRun = buildStubProcessRun({
    result: buildMockProcessResult({
      stdout: '{"decision":"deny","reason":"[Data Exfiltration] Refuse the transfer."}',
    }),
  });

  on('session.cwd', () => ({ value: '/repo' }));
  on('tool.check', () => decided);
  on('classic.SessionStart', () => ({}));
  on('process.run', processRun.hook);

  // oxlint-disable-next-line new-cap -- The host event API retains its event spelling.
  await $.classic.SessionStart({
    ...buildMockSessionContext({ session_id: 'session-1' }),
    source: 'startup',
  });

  const before = Date.now();

  const result = await $.tool.check({
    tool: 'Bash',
    input: { command: 'git push origin feature', timeout: 120_000 },
  });

  const after = Date.now();
  const [call] = processRun.calls;

  assertDefined(call);

  expect(result).toStrictEqual({
    decision: 'deny',
    reason: '[Data Exfiltration] Refuse the transfer.',
  });

  expect(processRun.calls).toStrictEqual([
    {
      argv: [
        'auto-mode',
        'run',
        '--jev-only',
        '--evaluation-deadline',
        expect.stringMatching(/^\d+$/),
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

  expect(Number(call.argv[4])).toBeGreaterThanOrEqual(before + 7500);
  expect(Number(call.argv[4])).toBeLessThanOrEqual(after + 7500);
});

test('it retains manual approval when Jev returns no opinion', async ($, on) => {
  const decided = buildMockPermissionDecision({ decision: 'ask' });
  const processRun = buildStubProcessRun({ result: buildMockProcessResult({ stdout: '' }) });

  on('session.cwd', () => ({ value: '/repo' }));
  on('tool.check', () => decided);
  on('classic.SessionStart', () => ({}));
  on('process.run', processRun.hook);

  // oxlint-disable-next-line new-cap -- The host event API retains its event spelling.
  await $.classic.SessionStart({
    ...buildMockSessionContext({ session_id: 'session-1' }),
    source: 'startup',
  });

  const before = Date.now();

  const result = await $.tool.check({
    tool: 'Bash',
    input: { command: 'git push origin feature', timeout: 120_000 },
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
        expect.stringMatching(/^\d+$/),
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

  expect(Number(call.argv[4])).toBeGreaterThanOrEqual(before + 7500);
  expect(Number(call.argv[4])).toBeLessThanOrEqual(after + 7500);
});

test('it retains manual approval for malformed JSON without copying diagnostics', async ($, on) => {
  const decided = buildMockPermissionDecision({ decision: 'ask' });

  const processRun = buildStubProcessRun({
    result: buildMockProcessResult({
      stdout: 'not-json synthetic-private-fragment',
      stderr: 'synthetic-private-fragment',
    }),
  });

  const logs: string[] = [];

  on('ui.log', (_api, e) => {
    logs.push(e.text);

    return { value: undefined };
  });

  on('session.cwd', () => ({ value: '/repo' }));
  on('tool.check', () => decided);
  on('classic.SessionStart', () => ({}));
  on('process.run', processRun.hook);

  // oxlint-disable-next-line new-cap -- The host event API retains its event spelling.
  await $.classic.SessionStart({
    ...buildMockSessionContext({ session_id: 'session-1' }),
    source: 'startup',
  });

  const before = Date.now();

  const result = await $.tool.check({
    tool: 'Bash',
    input: { command: 'git push origin feature', timeout: 120_000 },
  });

  const after = Date.now();
  const [call] = processRun.calls;

  assertDefined(call);

  expect(result).toStrictEqual(decided);

  expect(logs).toStrictEqual([
    'auto-mode action unavailable: evaluator invoked',
    'auto-mode action unavailable: manual approval retained; no usable verdict; inspect action diagnostics',
  ]);

  expect(processRun.calls).toStrictEqual([
    {
      argv: [
        'auto-mode',
        'run',
        '--jev-only',
        '--evaluation-deadline',
        expect.stringMatching(/^\d+$/),
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

  expect(Number(call.argv[4])).toBeGreaterThanOrEqual(before + 7500);
  expect(Number(call.argv[4])).toBeLessThanOrEqual(after + 7500);
});

test('it retains manual approval for a hook-shaped verdict', async ($, on) => {
  const decided = buildMockPermissionDecision({ decision: 'ask' });

  const processRun = buildStubProcessRun({
    result: buildMockProcessResult({
      stdout: '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"allow"}}',
    }),
  });

  on('session.cwd', () => ({ value: '/repo' }));
  on('tool.check', () => decided);
  on('classic.SessionStart', () => ({}));
  on('process.run', processRun.hook);

  // oxlint-disable-next-line new-cap -- The host event API retains its event spelling.
  await $.classic.SessionStart({
    ...buildMockSessionContext({ session_id: 'session-1' }),
    source: 'startup',
  });

  const before = Date.now();

  const result = await $.tool.check({
    tool: 'Bash',
    input: { command: 'git push origin feature', timeout: 120_000 },
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
        expect.stringMatching(/^\d+$/),
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

  expect(Number(call.argv[4])).toBeGreaterThanOrEqual(before + 7500);
  expect(Number(call.argv[4])).toBeLessThanOrEqual(after + 7500);
});

test('it retains manual approval for an allowance whose reason is not text', async ($, on) => {
  const decided = buildMockPermissionDecision({ decision: 'ask' });

  const processRun = buildStubProcessRun({
    result: buildMockProcessResult({ stdout: '{"decision":"allow","reason":123}' }),
  });

  on('session.cwd', () => ({ value: '/repo' }));
  on('tool.check', () => decided);
  on('classic.SessionStart', () => ({}));
  on('process.run', processRun.hook);

  // oxlint-disable-next-line new-cap -- The host event API retains its event spelling.
  await $.classic.SessionStart({
    ...buildMockSessionContext({ session_id: 'session-1' }),
    source: 'startup',
  });

  const before = Date.now();

  const result = await $.tool.check({
    tool: 'Bash',
    input: { command: 'git push origin feature', timeout: 120_000 },
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
        expect.stringMatching(/^\d+$/),
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

  expect(Number(call.argv[4])).toBeGreaterThanOrEqual(before + 7500);
  expect(Number(call.argv[4])).toBeLessThanOrEqual(after + 7500);
});

test('it retains manual approval for an allowance with an unknown field', async ($, on) => {
  const decided = buildMockPermissionDecision({ decision: 'ask' });

  const processRun = buildStubProcessRun({
    result: buildMockProcessResult({ stdout: '{"decision":"allow","rule":"Read-only actions"}' }),
  });

  on('session.cwd', () => ({ value: '/repo' }));
  on('tool.check', () => decided);
  on('classic.SessionStart', () => ({}));
  on('process.run', processRun.hook);

  // oxlint-disable-next-line new-cap -- The host event API retains its event spelling.
  await $.classic.SessionStart({
    ...buildMockSessionContext({ session_id: 'session-1' }),
    source: 'startup',
  });

  const before = Date.now();

  const result = await $.tool.check({
    tool: 'Bash',
    input: { command: 'git push origin feature', timeout: 120_000 },
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
        expect.stringMatching(/^\d+$/),
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

  expect(Number(call.argv[4])).toBeGreaterThanOrEqual(before + 7500);
  expect(Number(call.argv[4])).toBeLessThanOrEqual(after + 7500);
});

test('it retains manual approval for a denial with an unknown field', async ($, on) => {
  const decided = buildMockPermissionDecision({ decision: 'ask' });

  const processRun = buildStubProcessRun({
    result: buildMockProcessResult({
      stdout:
        '{"decision":"deny","reason":"[Data Exfiltration] Refuse the transfer.","extra":true}',
    }),
  });

  on('session.cwd', () => ({ value: '/repo' }));
  on('tool.check', () => decided);
  on('classic.SessionStart', () => ({}));
  on('process.run', processRun.hook);

  // oxlint-disable-next-line new-cap -- The host event API retains its event spelling.
  await $.classic.SessionStart({
    ...buildMockSessionContext({ session_id: 'session-1' }),
    source: 'startup',
  });

  const before = Date.now();

  const result = await $.tool.check({
    tool: 'Bash',
    input: { command: 'git push origin feature', timeout: 120_000 },
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
        expect.stringMatching(/^\d+$/),
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

  expect(Number(call.argv[4])).toBeGreaterThanOrEqual(before + 7500);
  expect(Number(call.argv[4])).toBeLessThanOrEqual(after + 7500);
});

test('it retains manual approval for a denial whose reason is not text', async ($, on) => {
  const decided = buildMockPermissionDecision({ decision: 'ask' });

  const processRun = buildStubProcessRun({
    result: buildMockProcessResult({ stdout: '{"decision":"deny","reason":42}' }),
  });

  on('session.cwd', () => ({ value: '/repo' }));
  on('tool.check', () => decided);
  on('classic.SessionStart', () => ({}));
  on('process.run', processRun.hook);

  // oxlint-disable-next-line new-cap -- The host event API retains its event spelling.
  await $.classic.SessionStart({
    ...buildMockSessionContext({ session_id: 'session-1' }),
    source: 'startup',
  });

  const before = Date.now();

  const result = await $.tool.check({
    tool: 'Bash',
    input: { command: 'git push origin feature', timeout: 120_000 },
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
        expect.stringMatching(/^\d+$/),
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

  expect(Number(call.argv[4])).toBeGreaterThanOrEqual(before + 7500);
  expect(Number(call.argv[4])).toBeLessThanOrEqual(after + 7500);
});

test('it retains manual approval for a verdict that is an array', async ($, on) => {
  const decided = buildMockPermissionDecision({ decision: 'ask' });

  const processRun = buildStubProcessRun({
    result: buildMockProcessResult({ stdout: '["allow"]' }),
  });

  on('session.cwd', () => ({ value: '/repo' }));
  on('tool.check', () => decided);
  on('classic.SessionStart', () => ({}));
  on('process.run', processRun.hook);

  // oxlint-disable-next-line new-cap -- The host event API retains its event spelling.
  await $.classic.SessionStart({
    ...buildMockSessionContext({ session_id: 'session-1' }),
    source: 'startup',
  });

  const before = Date.now();

  const result = await $.tool.check({
    tool: 'Bash',
    input: { command: 'git push origin feature', timeout: 120_000 },
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
        expect.stringMatching(/^\d+$/),
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

  expect(Number(call.argv[4])).toBeGreaterThanOrEqual(before + 7500);
  expect(Number(call.argv[4])).toBeLessThanOrEqual(after + 7500);
});

test('it retains manual approval for a malformed denial', async ($, on) => {
  const decided = buildMockPermissionDecision({ decision: 'ask' });

  const processRun = buildStubProcessRun({
    result: buildMockProcessResult({ stdout: '{"decision":"deny"}' }),
  });

  on('session.cwd', () => ({ value: '/repo' }));
  on('tool.check', () => decided);
  on('classic.SessionStart', () => ({}));
  on('process.run', processRun.hook);

  // oxlint-disable-next-line new-cap -- The host event API retains its event spelling.
  await $.classic.SessionStart({
    ...buildMockSessionContext({ session_id: 'session-1' }),
    source: 'startup',
  });

  const before = Date.now();

  const result = await $.tool.check({
    tool: 'Bash',
    input: { command: 'git push origin feature', timeout: 120_000 },
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
        expect.stringMatching(/^\d+$/),
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

  expect(Number(call.argv[4])).toBeGreaterThanOrEqual(before + 7500);
  expect(Number(call.argv[4])).toBeLessThanOrEqual(after + 7500);
});

test('it retains manual approval for a truncated response', async ($, on) => {
  const decided = buildMockPermissionDecision({ decision: 'ask' });

  const processRun = buildStubProcessRun({
    result: buildMockProcessResult({ stdout: '{"decision":"allow"}', isStdoutTruncated: true }),
  });

  on('session.cwd', () => ({ value: '/repo' }));
  on('tool.check', () => decided);
  on('classic.SessionStart', () => ({}));
  on('process.run', processRun.hook);

  // oxlint-disable-next-line new-cap -- The host event API retains its event spelling.
  await $.classic.SessionStart({
    ...buildMockSessionContext({ session_id: 'session-1' }),
    source: 'startup',
  });

  const before = Date.now();

  const result = await $.tool.check({
    tool: 'Bash',
    input: { command: 'git push origin feature', timeout: 120_000 },
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
        expect.stringMatching(/^\d+$/),
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

  expect(Number(call.argv[4])).toBeGreaterThanOrEqual(before + 7500);
  expect(Number(call.argv[4])).toBeLessThanOrEqual(after + 7500);
});

test('it retains manual approval when the child exits nonzero', async ($, on) => {
  const decided = buildMockPermissionDecision({ decision: 'ask' });

  const processRun = buildStubProcessRun({
    result: buildMockProcessResult({ exitCode: 1, stdout: '{"decision":"allow"}' }),
  });

  on('session.cwd', () => ({ value: '/repo' }));
  on('tool.check', () => decided);
  on('classic.SessionStart', () => ({}));
  on('process.run', processRun.hook);

  // oxlint-disable-next-line new-cap -- The host event API retains its event spelling.
  await $.classic.SessionStart({
    ...buildMockSessionContext({ session_id: 'session-1' }),
    source: 'startup',
  });

  const before = Date.now();

  const result = await $.tool.check({
    tool: 'Bash',
    input: { command: 'git push origin feature', timeout: 120_000 },
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
        expect.stringMatching(/^\d+$/),
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

  expect(Number(call.argv[4])).toBeGreaterThanOrEqual(before + 7500);
  expect(Number(call.argv[4])).toBeLessThanOrEqual(after + 7500);
});

test('it retains manual approval when the child run fails', async ($, on) => {
  const decided = buildMockPermissionDecision({ decision: 'ask' });
  const processRun = buildStubProcessRun({ failure: 'synthetic child failure' });

  on('session.cwd', () => ({ value: '/repo' }));
  on('tool.check', () => decided);
  on('classic.SessionStart', () => ({}));
  on('process.run', processRun.hook);

  // oxlint-disable-next-line new-cap -- The host event API retains its event spelling.
  await $.classic.SessionStart({
    ...buildMockSessionContext({ session_id: 'session-1' }),
    source: 'startup',
  });

  const before = Date.now();

  const result = await $.tool.check({
    tool: 'Bash',
    input: { command: 'git push origin feature', timeout: 120_000 },
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
        expect.stringMatching(/^\d+$/),
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

  expect(Number(call.argv[4])).toBeGreaterThanOrEqual(before + 7500);
  expect(Number(call.argv[4])).toBeLessThanOrEqual(after + 7500);
});

test('it retains manual approval before the session context arrives', async ($, on) => {
  const decided = buildMockPermissionDecision({ decision: 'ask' });

  const processRun = buildStubProcessRun({
    result: buildMockProcessResult({ stdout: '{"decision":"allow"}' }),
  });

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

    on('session.cwd', () => ({ value: '/repo' }));
    on('tool.check', () => buildMockPermissionDecision({ decision: 'ask' }));
    on('classic.SessionStart', () => ({}));
    on('process.run', processRun.hook);

    // oxlint-disable-next-line new-cap -- The host event API retains its event spelling.
    await $.classic.SessionStart({
      ...buildMockSessionContext({ session_id: 'session-1' }),
      source: 'startup',
    });

    const before = Date.now();

    const result = await $.tool.check({
      tool: 'Bash',
      input: { command: 'git push origin feature', timeout: 120_000 },
    });

    const after = Date.now();
    const [call] = processRun.calls;

    assertDefined(call);

    expect(result).toStrictEqual({ decision: 'allow' });

    expect(processRun.calls).toStrictEqual([
      {
        argv: [
          '/opt/auto mode/bin/auto-mode',
          'run',
          '--jev-only',
          '--evaluation-deadline',
          expect.stringMatching(/^\d+$/),
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

    expect(Number(call.argv[4])).toBeGreaterThanOrEqual(before + 7500);
    expect(Number(call.argv[4])).toBeLessThanOrEqual(after + 7500);
  },
);

test('it refreshes the context from the current user prompt after reload', async ($, on) => {
  const decided = buildMockPermissionDecision({ decision: 'ask' });
  const processRun = buildStubProcessRun({ result: buildMockProcessResult() });

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
        expect.stringMatching(/^\d+$/),
      ],
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

  expect(Number(call.argv[4])).toBeGreaterThanOrEqual(before + 7500);
  expect(Number(call.argv[4])).toBeLessThanOrEqual(after + 7500);
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
        expect.stringMatching(/^\d+$/),
      ],
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

  expect(Number(call.argv[4])).toBeGreaterThanOrEqual(before + 7500);
  expect(Number(call.argv[4])).toBeLessThanOrEqual(after + 7500);
});

test('it preserves the complete action without truncation', async ($, on) => {
  const content = 'x'.repeat(120_000);
  const decided = buildMockPermissionDecision({ decision: 'ask' });
  const processRun = buildStubProcessRun({ result: buildMockProcessResult() });

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
        expect.stringMatching(/^\d+$/),
      ],
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

  expect(Number(call.argv[4])).toBeGreaterThanOrEqual(before + 7500);
  expect(Number(call.argv[4])).toBeLessThanOrEqual(after + 7500);
});

test('it does not replace the main context with a subagent prompt', async ($, on) => {
  const decided = buildMockPermissionDecision({ decision: 'ask' });
  const processRun = buildStubProcessRun({ result: buildMockProcessResult() });

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
        expect.stringMatching(/^\d+$/),
      ],
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

  expect(Number(call.argv[4])).toBeGreaterThanOrEqual(before + 7500);
  expect(Number(call.argv[4])).toBeLessThanOrEqual(after + 7500);
});

test('it honors a configured fail-closed classifier verdict', async ($, on) => {
  const processRun = buildStubProcessRun({
    result: buildMockProcessResult({
      stdout: '{"decision":"deny","reason":"[Classifier Unavailable] Jev unavailable."}',
    }),
  });

  on('classic.SessionStart', () => ({}));
  on('session.cwd', () => ({ value: '/repo' }));
  on('tool.check', () => buildMockPermissionDecision({ decision: 'ask' }));
  on('process.run', processRun.hook);

  // oxlint-disable-next-line new-cap -- The host event API retains its event spelling.
  await $.classic.SessionStart({ ...buildMockSessionContext(), source: 'startup' });

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

  expect(processRun.calls).toStrictEqual([
    {
      argv: [
        'auto-mode',
        'run',
        '--jev-only',
        '--evaluation-deadline',
        expect.stringMatching(/^\d+$/),
      ],
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
      argv: [
        'auto-mode',
        'run',
        '--jev-only',
        '--evaluation-deadline',
        expect.stringMatching(/^\d+$/),
      ],
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

test('it logs the invocation and the fallback without copying child output', async ($, on) => {
  const decided = buildMockPermissionDecision({ decision: 'ask' });
  const logs: string[] = [];

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
  await $.classic.SessionStart({ ...buildMockSessionContext(), source: 'startup' });

  const result = await $.tool.check({ tool: 'Bash', input: { command: 'private-action-canary' } });

  expect(result).toStrictEqual(decided);

  expect(logs).toStrictEqual([
    'auto-mode action unavailable: evaluator invoked',
    'auto-mode action unavailable: manual approval retained; no usable verdict; inspect action diagnostics',
  ]);
});

test('it logs a subprocess failure when the child run fails', async ($, on) => {
  const decided = buildMockPermissionDecision({ decision: 'ask' });
  const logs: string[] = [];

  on('ui.log', (_api, e) => {
    logs.push(e.text);

    return { value: undefined };
  });

  on('classic.SessionStart', () => ({}));
  on('session.cwd', () => ({ value: '/repo' }));
  on('tool.check', () => decided);
  on('process.run', buildStubProcessRun({ failure: 'synthetic child failure' }).hook);

  // oxlint-disable-next-line new-cap -- The host event API retains its event spelling.
  await $.classic.SessionStart({ ...buildMockSessionContext(), source: 'startup' });

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

  on('session.cwd', () => ({ value: '/repo' }));
  on('classic.SessionStart', () => ({}));
  on('tool.call', () => called);
  on('process.run', processRun.hook);

  // oxlint-disable-next-line new-cap -- The host event API retains its event spelling.
  await $.classic.SessionStart({
    ...buildMockSessionContext({ session_id: 'session-1' }),
    source: 'startup',
  });

  const before = Date.now();

  const result = await $.tool.call({
    tool: 'Bash',
    tool_use_id: 'call-1',
    command: 'gh pr create --fill',
  });

  const after = Date.now();
  const [call] = processRun.calls;

  assertDefined(call);
  assertDefined(call.request);

  // oxlint-disable-next-line typescript/dot-notation -- noPropertyAccessFromIndexSignature needs brackets.
  const startedAt = call.request['startedAt'];

  expect(result).toStrictEqual(called);

  expect(processRun.calls).toStrictEqual([
    {
      argv: ['auto-mode', 'record'],
      timeoutMs: 8000,
      request: {
        sessionID: 'session-1',
        cwd: '/repo',
        startedAt: expect.any(Number),
        command: 'gh pr create --fill',
        resultText: 'https://github.com/dev/app/pull/3\n',
      },
    },
  ]);

  expect(startedAt).toBeGreaterThanOrEqual(before);
  expect(startedAt).toBeLessThanOrEqual(after);
});

test('it records nothing for a Bash call that cannot create scope', async ($, on) => {
  const processRun = buildStubProcessRun({ result: buildMockProcessResult() });

  on('session.cwd', () => ({ value: '/repo' }));
  on('classic.SessionStart', () => ({}));
  on('tool.call', () => buildMockCallResult());
  on('process.run', processRun.hook);

  // oxlint-disable-next-line new-cap -- The host event API retains its event spelling.
  await $.classic.SessionStart({ ...buildMockSessionContext(), source: 'startup' });
  await $.tool.call({ tool: 'Bash', tool_use_id: 'call-1', command: 'bun test' });

  expect(processRun.calls).toStrictEqual([]);
});

test('it records nothing for a scope-creating Bash call that was denied', async ($, on) => {
  const processRun = buildStubProcessRun({ result: buildMockProcessResult() });

  on('session.cwd', () => ({ value: '/repo' }));
  on('classic.SessionStart', () => ({}));
  on('tool.call', () => ({ deny: 'no' }));
  on('process.run', processRun.hook);

  // oxlint-disable-next-line new-cap -- The host event API retains its event spelling.
  await $.classic.SessionStart({ ...buildMockSessionContext(), source: 'startup' });
  await $.tool.call({ tool: 'Bash', tool_use_id: 'call-2', command: 'git checkout -b x' });

  expect(processRun.calls).toStrictEqual([]);
});
