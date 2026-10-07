import { expect, test } from 'claude-code/testing';

const NO_PROMPT_CONTEXT = {
  agentID: null,
  originalUserTask: null,
  delegatedTask: null,
  lastDirectUserMessage: null,
  omittedTaskContext: [{ field: 'originalUserTask', reason: 'unavailable' }],
};

test('it preserves an existing denial and its rule', async ($, on) => {
  const decided = {
    decision: 'deny',
    reason: 'Existing permission decision',
    rule: 'Bash(git push:*)',
    hook: 'PreToolUse',
  } as const;

  let calls = 0;

  on('session.cwd', () => ({ value: '/repo' }));
  on('tool.check', () => decided);
  on('classic.SessionStart', () => ({}));

  on('process.run', () => {
    calls += 1;

    return {
      value: {
        exitCode: 0,
        stdout: '{"decision":"allow"}',
        stderr: 'synthetic-private-fragment',
        isStdoutTruncated: false,
        isStderrTruncated: false,
      },
    };
  });

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
  expect(calls).toBe(0);
});

test('it preserves an existing allowance without a second evaluator', async ($, on) => {
  const decided = {
    decision: 'allow',
    reason: 'Existing permission decision',
    rule: 'Bash(git push:*)',
    hook: 'PreToolUse',
  } as const;

  let calls = 0;

  on('session.cwd', () => ({ value: '/repo' }));
  on('tool.check', () => decided);
  on('classic.SessionStart', () => ({}));

  on('process.run', () => {
    calls += 1;

    return {
      value: {
        exitCode: 0,
        stdout: '{"decision":"deny","reason":"[Data Exfiltration] Refuse the transfer."}',
        stderr: 'synthetic-private-fragment',
        isStdoutTruncated: false,
        isStderrTruncated: false,
      },
    };
  });

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
  expect(calls).toBe(0);
});

test('it approves an ask after Jev allows the action', async ($, on) => {
  const decided = {
    decision: 'ask',
    reason: 'Existing permission decision',
    rule: 'Bash(git push:*)',
    hook: 'PreToolUse',
  } as const;

  let calls = 0;
  let invocation: unknown;
  let stdin = '';
  let timeoutMs = 0;

  on('session.cwd', () => ({ value: '/repo' }));
  on('tool.check', () => decided);
  on('classic.SessionStart', () => ({}));

  on('process.run', (_api, e) => {
    calls += 1;
    invocation = e;
    stdin = e.init?.stdin ?? '';
    timeoutMs = e.init?.timeoutMs ?? 0;

    return {
      value: {
        exitCode: 0,
        stdout: '{"decision":"allow"}',
        stderr: 'synthetic-private-fragment',
        isStdoutTruncated: false,
        isStderrTruncated: false,
      },
    };
  });

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
  expect(calls).toBe(1);
  expect(timeoutMs).toBeGreaterThan(0);
  expect(timeoutMs).toBeLessThanOrEqual(8000);

  expect(JSON.parse(stdin)).toStrictEqual({
    sessionID: 'session-1',
    cwd: '/repo',
    toolName: 'Bash',
    toolInput: { command: 'git push origin feature', timeout: 120_000 },
    context: NO_PROMPT_CONTEXT,
  });

  expect(invocation).toMatchObject({
    argv: ['auto-mode', 'run', '--jev-only', '--evaluation-deadline', expect.any(String)],
    init: { timeoutMs: expect.any(Number), stdin: expect.any(String) },
  });
});

test('it refuses an ask after Jev denies the action', async ($, on) => {
  const decided = {
    decision: 'ask',
    reason: 'Existing permission decision',
    rule: 'Bash(git push:*)',
    hook: 'PreToolUse',
  } as const;

  let calls = 0;
  let invocation: unknown;
  let stdin = '';
  let timeoutMs = 0;

  on('session.cwd', () => ({ value: '/repo' }));
  on('tool.check', () => decided);
  on('classic.SessionStart', () => ({}));

  on('process.run', (_api, e) => {
    calls += 1;
    invocation = e;
    stdin = e.init?.stdin ?? '';
    timeoutMs = e.init?.timeoutMs ?? 0;

    return {
      value: {
        exitCode: 0,
        stdout: '{"decision":"deny","reason":"[Data Exfiltration] Refuse the transfer."}',
        stderr: 'synthetic-private-fragment',
        isStdoutTruncated: false,
        isStderrTruncated: false,
      },
    };
  });

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

  expect(calls).toBe(1);
  expect(timeoutMs).toBeGreaterThan(0);
  expect(timeoutMs).toBeLessThanOrEqual(8000);

  expect(JSON.parse(stdin)).toStrictEqual({
    sessionID: 'session-1',
    cwd: '/repo',
    toolName: 'Bash',
    toolInput: { command: 'git push origin feature', timeout: 120_000 },
    context: NO_PROMPT_CONTEXT,
  });

  expect(invocation).toMatchObject({
    argv: ['auto-mode', 'run', '--jev-only', '--evaluation-deadline', expect.any(String)],
    init: { timeoutMs: expect.any(Number), stdin: expect.any(String) },
  });
});

test('it retains manual approval when Jev returns no opinion', async ($, on) => {
  const decided = {
    decision: 'ask',
    reason: 'Existing permission decision',
    rule: 'Bash(git push:*)',
    hook: 'PreToolUse',
  } as const;

  let calls = 0;
  let invocation: unknown;
  let stdin = '';
  let timeoutMs = 0;

  on('session.cwd', () => ({ value: '/repo' }));
  on('tool.check', () => decided);
  on('classic.SessionStart', () => ({}));

  on('process.run', (_api, e) => {
    calls += 1;
    invocation = e;
    stdin = e.init?.stdin ?? '';
    timeoutMs = e.init?.timeoutMs ?? 0;

    return {
      value: {
        exitCode: 0,
        stdout: '',
        stderr: 'synthetic-private-fragment',
        isStdoutTruncated: false,
        isStderrTruncated: false,
      },
    };
  });

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
  expect(calls).toBe(1);
  expect(timeoutMs).toBeGreaterThan(0);
  expect(timeoutMs).toBeLessThanOrEqual(8000);

  expect(JSON.parse(stdin)).toStrictEqual({
    sessionID: 'session-1',
    cwd: '/repo',
    toolName: 'Bash',
    toolInput: { command: 'git push origin feature', timeout: 120_000 },
    context: NO_PROMPT_CONTEXT,
  });

  expect(invocation).toMatchObject({
    argv: ['auto-mode', 'run', '--jev-only', '--evaluation-deadline', expect.any(String)],
    init: { timeoutMs: expect.any(Number), stdin: expect.any(String) },
  });
});

test('it retains manual approval for malformed JSON without copying diagnostics', async ($, on) => {
  const decided = {
    decision: 'ask',
    reason: 'Existing permission decision',
    rule: 'Bash(git push:*)',
    hook: 'PreToolUse',
  } as const;

  let calls = 0;
  let invocation: unknown;
  let stdin = '';
  let timeoutMs = 0;

  on('session.cwd', () => ({ value: '/repo' }));
  on('tool.check', () => decided);
  on('classic.SessionStart', () => ({}));

  on('process.run', (_api, e) => {
    calls += 1;
    invocation = e;
    stdin = e.init?.stdin ?? '';
    timeoutMs = e.init?.timeoutMs ?? 0;

    return {
      value: {
        exitCode: 0,
        stdout: 'not-json synthetic-private-fragment',
        stderr: 'synthetic-private-fragment',
        isStdoutTruncated: false,
        isStderrTruncated: false,
      },
    };
  });

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
  expect(calls).toBe(1);
  expect(timeoutMs).toBeGreaterThan(0);
  expect(timeoutMs).toBeLessThanOrEqual(8000);

  expect(JSON.parse(stdin)).toStrictEqual({
    sessionID: 'session-1',
    cwd: '/repo',
    toolName: 'Bash',
    toolInput: { command: 'git push origin feature', timeout: 120_000 },
    context: NO_PROMPT_CONTEXT,
  });

  expect(invocation).toMatchObject({
    argv: ['auto-mode', 'run', '--jev-only', '--evaluation-deadline', expect.any(String)],
    init: { timeoutMs: expect.any(Number), stdin: expect.any(String) },
  });
});

test('it retains manual approval for a hook-shaped verdict', async ($, on) => {
  const decided = {
    decision: 'ask',
    reason: 'Existing permission decision',
    rule: 'Bash(git push:*)',
    hook: 'PreToolUse',
  } as const;

  let calls = 0;
  let invocation: unknown;
  let stdin = '';
  let timeoutMs = 0;

  on('session.cwd', () => ({ value: '/repo' }));
  on('tool.check', () => decided);
  on('classic.SessionStart', () => ({}));

  on('process.run', (_api, e) => {
    calls += 1;
    invocation = e;
    stdin = e.init?.stdin ?? '';
    timeoutMs = e.init?.timeoutMs ?? 0;

    return {
      value: {
        exitCode: 0,
        stdout:
          '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"allow"}}',
        stderr: 'synthetic-private-fragment',
        isStdoutTruncated: false,
        isStderrTruncated: false,
      },
    };
  });

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
  expect(calls).toBe(1);
  expect(timeoutMs).toBeGreaterThan(0);
  expect(timeoutMs).toBeLessThanOrEqual(8000);

  expect(JSON.parse(stdin)).toStrictEqual({
    sessionID: 'session-1',
    cwd: '/repo',
    toolName: 'Bash',
    toolInput: { command: 'git push origin feature', timeout: 120_000 },
    context: NO_PROMPT_CONTEXT,
  });

  expect(invocation).toMatchObject({
    argv: ['auto-mode', 'run', '--jev-only', '--evaluation-deadline', expect.any(String)],
    init: { timeoutMs: expect.any(Number), stdin: expect.any(String) },
  });
});

test('it retains manual approval for a verdict with unknown or mistyped fields', async ($, on) => {
  const outputs = [
    '{"decision":"allow","reason":123}',
    '{"decision":"allow","rule":"Read-only actions"}',
    '{"decision":"deny","reason":"[Data Exfiltration] Refuse the transfer.","extra":true}',
    '{"decision":"deny","reason":42}',
    '["allow"]',
  ];

  let stdout = '';

  on('classic.SessionStart', () => ({}));
  on('session.cwd', () => ({ value: '/repo' }));
  on('tool.check', () => ({ decision: 'ask' }));

  on('process.run', () => ({
    value: {
      exitCode: 0,
      stdout,
      stderr: '',
      isStdoutTruncated: false,
      isStderrTruncated: false,
    },
  }));

  // oxlint-disable-next-line new-cap -- The host event API retains its event spelling.
  await $.classic.SessionStart({ source: 'startup', session_id: 'session-1', cwd: '/repo' });

  const results: unknown[] = [];

  for (const output of outputs) {
    stdout = output;

    const result = await $.tool.check({ tool: 'Bash', input: { command: 'rm fixture.txt' } });

    results.push(result);
  }

  expect(results).toStrictEqual(outputs.map(() => ({ decision: 'ask' })));
});

test('it retains manual approval for a malformed denial', async ($, on) => {
  const decided = {
    decision: 'ask',
    reason: 'Existing permission decision',
    rule: 'Bash(git push:*)',
    hook: 'PreToolUse',
  } as const;

  let calls = 0;
  let invocation: unknown;
  let stdin = '';
  let timeoutMs = 0;

  on('session.cwd', () => ({ value: '/repo' }));
  on('tool.check', () => decided);
  on('classic.SessionStart', () => ({}));

  on('process.run', (_api, e) => {
    calls += 1;
    invocation = e;
    stdin = e.init?.stdin ?? '';
    timeoutMs = e.init?.timeoutMs ?? 0;

    return {
      value: {
        exitCode: 0,
        stdout: '{"decision":"deny"}',
        stderr: 'synthetic-private-fragment',
        isStdoutTruncated: false,
        isStderrTruncated: false,
      },
    };
  });

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
  expect(calls).toBe(1);
  expect(timeoutMs).toBeGreaterThan(0);
  expect(timeoutMs).toBeLessThanOrEqual(8000);

  expect(JSON.parse(stdin)).toStrictEqual({
    sessionID: 'session-1',
    cwd: '/repo',
    toolName: 'Bash',
    toolInput: { command: 'git push origin feature', timeout: 120_000 },
    context: NO_PROMPT_CONTEXT,
  });

  expect(invocation).toMatchObject({
    argv: ['auto-mode', 'run', '--jev-only', '--evaluation-deadline', expect.any(String)],
    init: { timeoutMs: expect.any(Number), stdin: expect.any(String) },
  });
});

test('it retains manual approval for a truncated response', async ($, on) => {
  const decided = {
    decision: 'ask',
    reason: 'Existing permission decision',
    rule: 'Bash(git push:*)',
    hook: 'PreToolUse',
  } as const;

  let calls = 0;
  let invocation: unknown;
  let stdin = '';
  let timeoutMs = 0;

  on('session.cwd', () => ({ value: '/repo' }));
  on('tool.check', () => decided);
  on('classic.SessionStart', () => ({}));

  on('process.run', (_api, e) => {
    calls += 1;
    invocation = e;
    stdin = e.init?.stdin ?? '';
    timeoutMs = e.init?.timeoutMs ?? 0;

    return {
      value: {
        exitCode: 0,
        stdout: '{"decision":"allow"}',
        stderr: 'synthetic-private-fragment',
        isStdoutTruncated: true,
        isStderrTruncated: false,
      },
    };
  });

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
  expect(calls).toBe(1);
  expect(timeoutMs).toBeGreaterThan(0);
  expect(timeoutMs).toBeLessThanOrEqual(8000);

  expect(JSON.parse(stdin)).toStrictEqual({
    sessionID: 'session-1',
    cwd: '/repo',
    toolName: 'Bash',
    toolInput: { command: 'git push origin feature', timeout: 120_000 },
    context: NO_PROMPT_CONTEXT,
  });

  expect(invocation).toMatchObject({
    argv: ['auto-mode', 'run', '--jev-only', '--evaluation-deadline', expect.any(String)],
    init: { timeoutMs: expect.any(Number), stdin: expect.any(String) },
  });
});

test('it retains manual approval when the child exits nonzero', async ($, on) => {
  const decided = {
    decision: 'ask',
    reason: 'Existing permission decision',
    rule: 'Bash(git push:*)',
    hook: 'PreToolUse',
  } as const;

  let calls = 0;
  let invocation: unknown;
  let stdin = '';
  let timeoutMs = 0;

  on('session.cwd', () => ({ value: '/repo' }));
  on('tool.check', () => decided);
  on('classic.SessionStart', () => ({}));

  on('process.run', (_api, e) => {
    calls += 1;
    invocation = e;
    stdin = e.init?.stdin ?? '';
    timeoutMs = e.init?.timeoutMs ?? 0;

    return {
      value: {
        exitCode: 1,
        stdout: '{"decision":"allow"}',
        stderr: 'synthetic-private-fragment',
        isStdoutTruncated: false,
        isStderrTruncated: false,
      },
    };
  });

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
  expect(calls).toBe(1);
  expect(timeoutMs).toBeGreaterThan(0);
  expect(timeoutMs).toBeLessThanOrEqual(8000);

  expect(JSON.parse(stdin)).toStrictEqual({
    sessionID: 'session-1',
    cwd: '/repo',
    toolName: 'Bash',
    toolInput: { command: 'git push origin feature', timeout: 120_000 },
    context: NO_PROMPT_CONTEXT,
  });

  expect(invocation).toMatchObject({
    argv: ['auto-mode', 'run', '--jev-only', '--evaluation-deadline', expect.any(String)],
    init: { timeoutMs: expect.any(Number), stdin: expect.any(String) },
  });
});

test('it retains manual approval when the child times out', async ($, on) => {
  const decided = {
    decision: 'ask',
    reason: 'Existing permission decision',
    rule: 'Bash(git push:*)',
    hook: 'PreToolUse',
  } as const;

  let calls = 0;
  let invocation: unknown;
  let stdin = '';
  let timeoutMs = 0;

  on('session.cwd', () => ({ value: '/repo' }));
  on('tool.check', () => decided);
  on('classic.SessionStart', () => ({}));

  on('process.run', (_api, e) => {
    calls += 1;
    invocation = e;
    stdin = e.init?.stdin ?? '';
    timeoutMs = e.init?.timeoutMs ?? 0;
    throw new Error('synthetic child timeout; private diagnostics');
  });

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
  expect(calls).toBe(1);
  expect(timeoutMs).toBeGreaterThan(0);
  expect(timeoutMs).toBeLessThanOrEqual(8000);

  expect(JSON.parse(stdin)).toStrictEqual({
    sessionID: 'session-1',
    cwd: '/repo',
    toolName: 'Bash',
    toolInput: { command: 'git push origin feature', timeout: 120_000 },
    context: NO_PROMPT_CONTEXT,
  });

  expect(invocation).toMatchObject({
    argv: ['auto-mode', 'run', '--jev-only', '--evaluation-deadline', expect.any(String)],
    init: { timeoutMs: expect.any(Number), stdin: expect.any(String) },
  });
});

test('it retains manual approval before the session context arrives', async ($, on) => {
  const decided = {
    decision: 'ask',
    reason: 'Existing permission decision',
    rule: 'Bash(git push:*)',
    hook: 'PreToolUse',
  } as const;

  let calls = 0;

  on('session.cwd', () => ({ value: '/repo' }));
  on('tool.check', () => decided);

  on('process.run', () => {
    calls += 1;

    return {
      value: {
        exitCode: 0,
        stdout: '{"decision":"allow"}',
        stderr: 'synthetic-private-fragment',
        isStdoutTruncated: false,
        isStderrTruncated: false,
      },
    };
  });

  const result = await $.tool.check({
    tool: 'Bash',
    input: { command: 'git push origin feature', timeout: 120_000 },
  });

  expect(result).toStrictEqual(decided);
  expect(calls).toBe(0);
});

test(
  'it passes a configured executable as one argument without a shell',
  { options: { command: '/opt/auto mode/bin/auto-mode' } },
  async ($, on) => {
    const decided = {
      decision: 'ask',
      reason: 'Existing permission decision',
      rule: 'Bash(git push:*)',
      hook: 'PreToolUse',
    } as const;

    let calls = 0;
    let invocation: unknown;
    let stdin = '';
    let timeoutMs = 0;

    on('session.cwd', () => ({ value: '/repo' }));
    on('tool.check', () => decided);
    on('classic.SessionStart', () => ({}));

    on('process.run', (_api, e) => {
      calls += 1;
      invocation = e;
      stdin = e.init?.stdin ?? '';
      timeoutMs = e.init?.timeoutMs ?? 0;

      return {
        value: {
          exitCode: 0,
          stdout: '{"decision":"allow"}',
          stderr: 'synthetic-private-fragment',
          isStdoutTruncated: false,
          isStderrTruncated: false,
        },
      };
    });

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
    expect(calls).toBe(1);
    expect(timeoutMs).toBeGreaterThan(0);
    expect(timeoutMs).toBeLessThanOrEqual(8000);

    expect(JSON.parse(stdin)).toStrictEqual({
      sessionID: 'session-1',
      cwd: '/repo',
      toolName: 'Bash',
      toolInput: { command: 'git push origin feature', timeout: 120_000 },
      context: NO_PROMPT_CONTEXT,
    });

    expect(invocation).toMatchObject({
      argv: [
        '/opt/auto mode/bin/auto-mode',
        'run',
        '--jev-only',
        '--evaluation-deadline',
        expect.any(String),
      ],
      init: { timeoutMs: expect.any(Number), stdin: expect.any(String) },
    });
  },
);

test('it refreshes the context from the current user prompt after reload', async ($, on) => {
  on('classic.UserPromptSubmit', () => ({}));
  on('session.cwd', () => ({ value: '/new-repo' }));
  on('tool.check', () => ({ decision: 'ask' }));

  let stdin = '';

  on('process.run', (_api, e) => {
    stdin = e.init?.stdin ?? '';

    return {
      value: {
        exitCode: 0,
        stdout: '',
        stderr: '',
        isStdoutTruncated: false,
        isStderrTruncated: false,
      },
    };
  });

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

  expect(result).toStrictEqual({ decision: 'ask' });
  expect(JSON.parse(stdin)).toMatchObject({ sessionID: 'new-session', cwd: '/new-repo' });
  expect(stdin.includes('transcript')).toBe(false);
});

test('it carries the session identity and the direct user message', async ($, on) => {
  let stdin = '';

  on('classic.SessionStart', () => ({}));
  on('prompt.submit', (_api, e) => ({ text: e.text }));
  on('session.cwd', () => ({ value: '/repo' }));
  on('tool.check', () => ({ decision: 'ask' }));

  on('process.run', (_api, e) => {
    stdin = e.init?.stdin ?? '';

    return {
      value: {
        exitCode: 0,
        stdout: '',
        stderr: '',
        isStdoutTruncated: false,
        isStderrTruncated: false,
      },
    };
  });

  // oxlint-disable-next-line new-cap -- The host event API retains its event spelling.
  await $.classic.SessionStart({ source: 'startup', session_id: 'session-1', cwd: '/repo' });
  await $.prompt.submit({ text: 'Clean the build output.', origin: { kind: 'composer' } });
  await $.tool.check({ tool: 'Bash', input: { command: 'rm -rf dist' } });

  expect(JSON.parse(stdin)).toMatchObject({
    sessionID: 'session-1',
    context: {
      agentID: null,
      originalUserTask: { text: 'Clean the build output.' },
      lastDirectUserMessage: { text: 'Clean the build output.' },
      omittedTaskContext: [],
    },
  });
});

test('it preserves the complete action without truncation', async ($, on) => {
  const content = 'x'.repeat(120_000);
  let stdin = '';

  on('classic.SessionStart', () => ({}));
  on('session.cwd', () => ({ value: '/repo' }));
  on('tool.check', () => ({ decision: 'ask' }));

  on('process.run', (_api, e) => {
    stdin = e.init?.stdin ?? '';

    return {
      value: {
        exitCode: 0,
        stdout: '',
        stderr: '',
        isStdoutTruncated: false,
        isStderrTruncated: false,
      },
    };
  });

  // oxlint-disable-next-line new-cap -- The host event API retains its event spelling.
  await $.classic.SessionStart({ source: 'startup' });

  const result = await $.tool.check({ tool: 'Write', input: { file_path: '/repo/file', content } });

  expect(result).toStrictEqual({ decision: 'ask' });
  expect(JSON.parse(stdin)).toMatchObject({ toolInput: { file_path: '/repo/file', content } });
});

test('it does not replace the main context with a subagent prompt', async ($, on) => {
  let stdin = '';

  on('classic.SessionStart', () => ({}));
  on('classic.UserPromptSubmit', () => ({}));
  on('session.cwd', () => ({ value: '/main' }));
  on('tool.check', () => ({ decision: 'ask' }));

  on('process.run', (_api, e) => {
    stdin = e.init?.stdin ?? '';

    return {
      value: {
        exitCode: 0,
        stdout: '',
        stderr: '',
        isStdoutTruncated: false,
        isStderrTruncated: false,
      },
    };
  });

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

  expect(result).toStrictEqual({ decision: 'ask' });
  expect(JSON.parse(stdin)).toMatchObject({ cwd: '/main', sessionID: 'main-session' });
});

test('it honors a configured fail-closed classifier verdict', async ($, on) => {
  on('classic.SessionStart', () => ({}));
  on('session.cwd', () => ({ value: '/repo' }));
  on('tool.check', () => ({ decision: 'ask' }));

  on('process.run', () => ({
    value: {
      exitCode: 0,
      stdout: JSON.stringify({
        decision: 'deny',
        reason: '[Classifier Unavailable] Jev unavailable.',
      }),
      stderr: '',
      isStdoutTruncated: false,
      isStderrTruncated: false,
    },
  }));

  // oxlint-disable-next-line new-cap -- The host event API retains its event spelling.
  await $.classic.SessionStart({ source: 'startup' });

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
  const inputs: unknown[] = [];

  on('classic.SessionStart', () => ({}));
  on('session.cwd', () => ({ value: cwd }));
  on('tool.check', () => ({ decision: 'ask' }));

  on('process.run', (_api, e) => {
    inputs.push(JSON.parse(e.init?.stdin ?? ''));

    return {
      value: {
        exitCode: 0,
        stdout: '',
        stderr: '',
        isStdoutTruncated: false,
        isStderrTruncated: false,
      },
    };
  });

  // oxlint-disable-next-line new-cap -- The host event API retains its event spelling.
  await $.classic.SessionStart({ source: 'startup', cwd: '/first' });
  await $.tool.check({ tool: 'Bash', input: { command: 'rm fixture.txt' } });

  cwd = '/second';

  await $.tool.check({ tool: 'Bash', input: { command: 'rm fixture.txt' } });

  expect(inputs).toMatchObject([{ cwd: '/first' }, { cwd: '/second' }]);
});

test('it records invocation and fallback without copying child output or failure text', async ($, on) => {
  const logs: string[] = [];

  on('ui.log', (_api, e) => {
    logs.push(e.text);

    return { value: undefined };
  });

  on('classic.SessionStart', () => ({}));
  on('session.cwd', () => ({ value: '/repo' }));
  on('tool.check', () => ({ decision: 'ask' }));

  on('process.run', () => ({
    value: {
      exitCode: 0,
      stdout: 'private-stdout-canary',
      stderr: 'private-stderr-canary',
      isStdoutTruncated: false,
      isStderrTruncated: false,
    },
  }));

  // oxlint-disable-next-line new-cap -- The host event API retains its event spelling.
  await $.classic.SessionStart({ source: 'startup' });

  const result = await $.tool.check({ tool: 'Bash', input: { command: 'private-action-canary' } });

  expect(result).toStrictEqual({ decision: 'ask' });

  expect(logs).toStrictEqual([
    'auto-mode action unavailable: evaluator invoked',
    'auto-mode action unavailable: manual approval retained; no usable verdict; inspect action diagnostics',
  ]);
});

test('it identifies a subprocess failure without copying the exception', async ($, on) => {
  const logs: string[] = [];

  on('ui.log', (_api, e) => {
    logs.push(e.text);

    return { value: undefined };
  });

  on('classic.SessionStart', () => ({}));
  on('session.cwd', () => ({ value: '/repo' }));
  on('tool.check', () => ({ decision: 'ask' }));

  on('process.run', () => {
    throw new Error('private-exception-canary: aborted: still running after 8000ms');
  });

  // oxlint-disable-next-line new-cap -- The host event API retains its event spelling.
  await $.classic.SessionStart({ source: 'startup' });

  const result = await $.tool.check({ tool: 'Bash', input: {} });

  expect(result).toStrictEqual({ decision: 'ask' });

  expect(logs).toStrictEqual([
    'auto-mode action unavailable: evaluator invoked',
    'auto-mode action unavailable: manual approval retained; subprocess failure',
  ]);
});
