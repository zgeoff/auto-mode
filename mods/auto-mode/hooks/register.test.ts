import { expect, test } from 'claude-code/testing';

test('it preserves an existing denial and its rule', async ($, on) => {
  const decided = {
    decision: 'deny',
    reason: 'Existing permission decision',
    rule: 'Bash(git push:*)',
    hook: 'PreToolUse',
  } as const;

  let calls = 0;

  on('tool.check', () => decided);
  on('classic.SessionStart', () => ({}));

  on('process.run', () => {
    calls += 1;

    return {
      value: {
        exitCode: 0,
        stdout:
          '{"hookSpecificOutput":{"hookEventName":"PermissionRequest","decision":{"behavior":"allow"}}}',
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

  on('tool.check', () => decided);
  on('classic.SessionStart', () => ({}));

  on('process.run', () => {
    calls += 1;

    return {
      value: {
        exitCode: 0,
        stdout:
          '{"hookSpecificOutput":{"hookEventName":"PermissionRequest","decision":{"behavior":"deny","message":"[Data Exfiltration] Refuse the transfer."}}}',
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
          '{"hookSpecificOutput":{"hookEventName":"PermissionRequest","decision":{"behavior":"allow"}}}',
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
    hook_event_name: 'PermissionRequest',
    prompt_id: 'mod-check',
    session_id: 'session-1',
    cwd: '/repo',
    transcript_path: '/repo/transcript.jsonl',
    tool_name: 'Bash',
    tool_input: { command: 'git push origin feature', timeout: 120_000 },
  });

  expect(invocation).toMatchObject({
    argv: ['auto-mode', 'run', '--jev-only'],
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
          '{"hookSpecificOutput":{"hookEventName":"PermissionRequest","decision":{"behavior":"deny","message":"[Data Exfiltration] Refuse the transfer."}}}',
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
    hook_event_name: 'PermissionRequest',
    prompt_id: 'mod-check',
    session_id: 'session-1',
    cwd: '/repo',
    transcript_path: '/repo/transcript.jsonl',
    tool_name: 'Bash',
    tool_input: { command: 'git push origin feature', timeout: 120_000 },
  });

  expect(invocation).toMatchObject({
    argv: ['auto-mode', 'run', '--jev-only'],
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
    hook_event_name: 'PermissionRequest',
    prompt_id: 'mod-check',
    session_id: 'session-1',
    cwd: '/repo',
    transcript_path: '/repo/transcript.jsonl',
    tool_name: 'Bash',
    tool_input: { command: 'git push origin feature', timeout: 120_000 },
  });

  expect(invocation).toMatchObject({
    argv: ['auto-mode', 'run', '--jev-only'],
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
    hook_event_name: 'PermissionRequest',
    prompt_id: 'mod-check',
    session_id: 'session-1',
    cwd: '/repo',
    transcript_path: '/repo/transcript.jsonl',
    tool_name: 'Bash',
    tool_input: { command: 'git push origin feature', timeout: 120_000 },
  });

  expect(invocation).toMatchObject({
    argv: ['auto-mode', 'run', '--jev-only'],
    init: { timeoutMs: expect.any(Number), stdin: expect.any(String) },
  });
});

test('it retains manual approval for a verdict from another event', async ($, on) => {
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
    hook_event_name: 'PermissionRequest',
    prompt_id: 'mod-check',
    session_id: 'session-1',
    cwd: '/repo',
    transcript_path: '/repo/transcript.jsonl',
    tool_name: 'Bash',
    tool_input: { command: 'git push origin feature', timeout: 120_000 },
  });

  expect(invocation).toMatchObject({
    argv: ['auto-mode', 'run', '--jev-only'],
    init: { timeoutMs: expect.any(Number), stdin: expect.any(String) },
  });
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
          '{"hookSpecificOutput":{"hookEventName":"PermissionRequest","decision":{"behavior":"deny"}}}',
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
    hook_event_name: 'PermissionRequest',
    prompt_id: 'mod-check',
    session_id: 'session-1',
    cwd: '/repo',
    transcript_path: '/repo/transcript.jsonl',
    tool_name: 'Bash',
    tool_input: { command: 'git push origin feature', timeout: 120_000 },
  });

  expect(invocation).toMatchObject({
    argv: ['auto-mode', 'run', '--jev-only'],
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
          '{"hookSpecificOutput":{"hookEventName":"PermissionRequest","decision":{"behavior":"allow"}}}',
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
    hook_event_name: 'PermissionRequest',
    prompt_id: 'mod-check',
    session_id: 'session-1',
    cwd: '/repo',
    transcript_path: '/repo/transcript.jsonl',
    tool_name: 'Bash',
    tool_input: { command: 'git push origin feature', timeout: 120_000 },
  });

  expect(invocation).toMatchObject({
    argv: ['auto-mode', 'run', '--jev-only'],
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
        stdout:
          '{"hookSpecificOutput":{"hookEventName":"PermissionRequest","decision":{"behavior":"allow"}}}',
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
    hook_event_name: 'PermissionRequest',
    prompt_id: 'mod-check',
    session_id: 'session-1',
    cwd: '/repo',
    transcript_path: '/repo/transcript.jsonl',
    tool_name: 'Bash',
    tool_input: { command: 'git push origin feature', timeout: 120_000 },
  });

  expect(invocation).toMatchObject({
    argv: ['auto-mode', 'run', '--jev-only'],
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
    hook_event_name: 'PermissionRequest',
    prompt_id: 'mod-check',
    session_id: 'session-1',
    cwd: '/repo',
    transcript_path: '/repo/transcript.jsonl',
    tool_name: 'Bash',
    tool_input: { command: 'git push origin feature', timeout: 120_000 },
  });

  expect(invocation).toMatchObject({
    argv: ['auto-mode', 'run', '--jev-only'],
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

  on('tool.check', () => decided);

  on('process.run', () => {
    calls += 1;

    return {
      value: {
        exitCode: 0,
        stdout:
          '{"hookSpecificOutput":{"hookEventName":"PermissionRequest","decision":{"behavior":"allow"}}}',
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
            '{"hookSpecificOutput":{"hookEventName":"PermissionRequest","decision":{"behavior":"allow"}}}',
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
      hook_event_name: 'PermissionRequest',
      prompt_id: 'mod-check',
      session_id: 'session-1',
      cwd: '/repo',
      transcript_path: '/repo/transcript.jsonl',
      tool_name: 'Bash',
      tool_input: { command: 'git push origin feature', timeout: 120_000 },
    });

    expect(invocation).toMatchObject({
      argv: ['/opt/auto mode/bin/auto-mode', 'run', '--jev-only'],
      init: { timeoutMs: expect.any(Number), stdin: expect.any(String) },
    });
  },
);

test('it refreshes the context from the current user prompt after reload', async ($, on) => {
  on('classic.UserPromptSubmit', () => ({}));
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

  expect(JSON.parse(stdin)).toMatchObject({
    session_id: 'new-session',
    cwd: '/new-repo',
    transcript_path: '/new-repo/current.jsonl',
  });
});

test('it preserves the complete action without truncation', async ($, on) => {
  const content = 'x'.repeat(120_000);
  let stdin = '';

  on('classic.SessionStart', () => ({}));
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
  expect(JSON.parse(stdin)).toMatchObject({ tool_input: { file_path: '/repo/file', content } });
});

test('it does not replace the main context with a subagent prompt', async ($, on) => {
  let stdin = '';

  on('classic.SessionStart', () => ({}));
  on('classic.UserPromptSubmit', () => ({}));
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

  expect(JSON.parse(stdin)).toMatchObject({
    cwd: '/main',
    session_id: 'main-session',
    transcript_path: '/main/user.jsonl',
  });
});

test('it honors a configured fail-closed classifier verdict', async ($, on) => {
  on('classic.SessionStart', () => ({}));
  on('tool.check', () => ({ decision: 'ask' }));

  on('process.run', () => ({
    value: {
      exitCode: 0,
      stdout: JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'PermissionRequest',
          decision: { behavior: 'deny', message: '[Classifier Unavailable] Jev unavailable.' },
        },
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
