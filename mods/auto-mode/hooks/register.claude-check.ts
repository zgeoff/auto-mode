import { expect, test } from 'claude-code/testing';
import { CLI_LIMITS } from '../contract/cli-limits.ts';
import { assertDefined } from './test-utils/assert-defined.ts';
import { buildStubProcessRun } from './test-utils/build-stub-process-run.ts';
import { buildMockPermissionDecision } from './test-utils/factories/build-mock-permission-decision.ts';
import { buildMockProcessResult } from './test-utils/factories/build-mock-process-result.ts';
import { buildMockSessionContext } from './test-utils/factories/build-mock-session-context.ts';

test('it approves an ask after Jev allows the action', async ($, on) => {
  const decided = buildMockPermissionDecision({ decision: 'ask' });
  const logs: { readonly text: string; readonly to: string | undefined }[] = [];

  on('ui.log', (_api, e) => {
    logs.push({ text: e.text, to: e.to });

    return { value: undefined };
  });

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

  expect(logs).toStrictEqual([
    { text: 'auto-mode action unavailable: evaluator invoked', to: 'debug' },
    { text: 'auto-mode action unavailable: evaluator verdict allow', to: 'debug' },
  ]);

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

  expect(Number(call.argv[4])).toBeGreaterThanOrEqual(before + CLI_LIMITS.evaluationMs - 500);
  expect(Number(call.argv[4])).toBeLessThanOrEqual(after + CLI_LIMITS.evaluationMs - 500);
});

test('it refuses an ask after Jev denies the action', async ($, on) => {
  const decided = buildMockPermissionDecision({ decision: 'ask' });
  const logs: { readonly text: string; readonly to: string | undefined }[] = [];

  on('ui.log', (_api, e) => {
    logs.push({ text: e.text, to: e.to });

    return { value: undefined };
  });

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

  expect(logs).toStrictEqual([
    { text: 'auto-mode action unavailable: evaluator invoked', to: 'debug' },
    { text: 'auto-mode action unavailable: evaluator verdict deny', to: 'debug' },
  ]);

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

  expect(Number(call.argv[4])).toBeGreaterThanOrEqual(before + CLI_LIMITS.evaluationMs - 500);
  expect(Number(call.argv[4])).toBeLessThanOrEqual(after + CLI_LIMITS.evaluationMs - 500);
});

test('it retains manual approval for malformed JSON without copying diagnostics', async ($, on) => {
  const decided = buildMockPermissionDecision({ decision: 'ask' });

  const processRun = buildStubProcessRun({
    result: buildMockProcessResult({
      stdout: 'not-json synthetic-private-fragment',
      stderr: 'synthetic-private-fragment',
    }),
  });

  const logs: { readonly text: string; readonly to: string | undefined }[] = [];

  on('ui.log', (_api, e) => {
    logs.push({ text: e.text, to: e.to });

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
    { text: 'auto-mode action unavailable: evaluator invoked', to: 'debug' },
    {
      text: 'auto-mode action unavailable: manual approval retained; no usable verdict; inspect action diagnostics',
      to: 'debug',
    },
  ]);

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

  expect(Number(call.argv[4])).toBeGreaterThanOrEqual(before + CLI_LIMITS.evaluationMs - 500);
  expect(Number(call.argv[4])).toBeLessThanOrEqual(after + CLI_LIMITS.evaluationMs - 500);
});

test('it retains manual approval for a truncated response', async ($, on) => {
  const decided = buildMockPermissionDecision({ decision: 'ask' });
  const logs: { readonly text: string; readonly to: string | undefined }[] = [];

  on('ui.log', (_api, e) => {
    logs.push({ text: e.text, to: e.to });

    return { value: undefined };
  });

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

  expect(logs).toStrictEqual([
    { text: 'auto-mode action unavailable: evaluator invoked', to: 'debug' },
    {
      text: 'auto-mode action unavailable: manual approval retained; truncated verdict',
      to: 'debug',
    },
  ]);

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

  expect(Number(call.argv[4])).toBeGreaterThanOrEqual(before + CLI_LIMITS.evaluationMs - 500);
  expect(Number(call.argv[4])).toBeLessThanOrEqual(after + CLI_LIMITS.evaluationMs - 500);
});

test('it retains manual approval when the child exits nonzero', async ($, on) => {
  const decided = buildMockPermissionDecision({ decision: 'ask' });
  const logs: { readonly text: string; readonly to: string | undefined }[] = [];

  on('ui.log', (_api, e) => {
    logs.push({ text: e.text, to: e.to });

    return { value: undefined };
  });

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

  expect(logs).toStrictEqual([
    { text: 'auto-mode action unavailable: evaluator invoked', to: 'debug' },
    { text: 'auto-mode action unavailable: manual approval retained; nonzero exit', to: 'debug' },
  ]);

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

  expect(Number(call.argv[4])).toBeGreaterThanOrEqual(before + CLI_LIMITS.evaluationMs - 500);
  expect(Number(call.argv[4])).toBeLessThanOrEqual(after + CLI_LIMITS.evaluationMs - 500);
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
        expect.stringMatching(/^\d+$/u),
      ],
      timeoutMs: CLI_LIMITS.evaluationMs,
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

  expect(Number(call.argv[4])).toBeGreaterThanOrEqual(before + CLI_LIMITS.evaluationMs - 500);
  expect(Number(call.argv[4])).toBeLessThanOrEqual(after + CLI_LIMITS.evaluationMs - 500);
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
          expect.stringMatching(/^\d+$/u),
        ],
        timeoutMs: CLI_LIMITS.evaluationMs,
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

    expect(Number(call.argv[4])).toBeGreaterThanOrEqual(before + CLI_LIMITS.evaluationMs - 500);
    expect(Number(call.argv[4])).toBeLessThanOrEqual(after + CLI_LIMITS.evaluationMs - 500);
  },
);
