import { expect, test } from 'claude-code/testing';
import { assertDefined } from './test-utils/assert-defined.ts';
import { buildStubProcessRun } from './test-utils/build-stub-process-run.ts';
import { buildMockCallResult } from './test-utils/factories/build-mock-call-result.ts';
import { buildMockProcessResult } from './test-utils/factories/build-mock-process-result.ts';
import { buildMockSessionContext } from './test-utils/factories/build-mock-session-context.ts';

test('it records a finished scope-creating Bash call with its result', async ($, on) => {
  const called = buildMockCallResult({
    result: { stdout: 'https://github.com/dev/app/pull/3\n', stderr: '' },
    deny: undefined,
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
  on('tool.call', () => buildMockCallResult({ deny: undefined }));
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
  on('tool.call', () => buildMockCallResult({ deny: 'no' }));
  on('process.run', processRun.hook);

  // oxlint-disable-next-line new-cap -- The host event API retains its event spelling.
  await $.classic.SessionStart({ ...buildMockSessionContext(), source: 'startup' });
  await $.tool.call({ tool: 'Bash', tool_use_id: 'call-2', command: 'git checkout -b x' });

  expect(processRun.calls).toStrictEqual([]);
});

test('it logs a record subprocess failure and returns the call result', async ($, on) => {
  const called = buildMockCallResult({
    deny: undefined,
    text: 'https://github.com/dev/app/pull/3\n',
  });

  const logs: { readonly text: string; readonly to: string | undefined }[] = [];

  on('ui.log', (_api, e) => {
    logs.push({ text: e.text, to: e.to });

    return { value: undefined };
  });

  on('session.cwd', () => ({ value: '/repo' }));
  on('classic.SessionStart', () => ({}));
  on('tool.call', () => called);
  on('process.run', buildStubProcessRun({ failure: 'synthetic child failure' }).hook);

  // oxlint-disable-next-line new-cap -- The host event API retains its event spelling.
  await $.classic.SessionStart({ ...buildMockSessionContext(), source: 'startup' });

  const result = await $.tool.call({
    tool: 'Bash',
    tool_use_id: 'call-1',
    command: 'gh pr create --fill',
  });

  expect(result).toStrictEqual(called);

  expect(logs).toStrictEqual([
    { text: 'auto-mode: session scope not recorded; subprocess failure', to: 'debug' },
  ]);
});

test(
  'it records the session scope through a configured executable',
  { options: { command: '/opt/auto mode/bin/auto-mode' } },
  async ($, on) => {
    const processRun = buildStubProcessRun({ result: buildMockProcessResult() });

    on('session.cwd', () => ({ value: '/repo' }));
    on('classic.SessionStart', () => ({}));
    on('tool.call', () => buildMockCallResult({ deny: undefined }));
    on('process.run', processRun.hook);

    // oxlint-disable-next-line new-cap -- The host event API retains its event spelling.
    await $.classic.SessionStart({ ...buildMockSessionContext(), source: 'startup' });
    await $.tool.call({ tool: 'Bash', tool_use_id: 'call-1', command: 'git switch -c fix/a' });

    const [call] = processRun.calls;

    assertDefined(call);

    expect(call.argv).toStrictEqual(['/opt/auto mode/bin/auto-mode', 'record']);
  },
);

test('it records nothing for a scope-creating Bash call before any session starts', async ($, on) => {
  const processRun = buildStubProcessRun({ result: buildMockProcessResult() });

  on('session.cwd', () => ({ value: '/repo' }));
  on('tool.call', () => buildMockCallResult({ deny: undefined }));
  on('process.run', processRun.hook);

  await $.tool.call({ tool: 'Bash', tool_use_id: 'call-1', command: 'gh pr create --fill' });

  expect(processRun.calls).toStrictEqual([]);
});

test('it records nothing for a scope-creating command outside the Bash tool', async ($, on) => {
  const processRun = buildStubProcessRun({ result: buildMockProcessResult() });

  on('session.cwd', () => ({ value: '/repo' }));
  on('classic.SessionStart', () => ({}));
  on('tool.call', () => buildMockCallResult({ deny: undefined }));
  on('process.run', processRun.hook);

  // oxlint-disable-next-line new-cap -- The host event API retains its event spelling.
  await $.classic.SessionStart({ ...buildMockSessionContext(), source: 'startup' });
  await $.tool.call({ tool: 'Write', tool_use_id: 'call-1', command: 'gh pr create --fill' });

  expect(processRun.calls).toStrictEqual([]);
});

test('it records nothing for a Bash command that is not text', async ($, on) => {
  const processRun = buildStubProcessRun({ result: buildMockProcessResult() });

  on('session.cwd', () => ({ value: '/repo' }));
  on('classic.SessionStart', () => ({}));
  on('tool.call', () => buildMockCallResult({ deny: undefined }));
  on('process.run', processRun.hook);

  // oxlint-disable-next-line new-cap -- The host event API retains its event spelling.
  await $.classic.SessionStart({ ...buildMockSessionContext(), source: 'startup' });
  await $.tool.call({ tool: 'Bash', tool_use_id: 'call-1', command: ['gh pr create --fill'] });

  expect(processRun.calls).toStrictEqual([]);
});

test('it records an empty result text for a call result without text', async ($, on) => {
  const processRun = buildStubProcessRun({ result: buildMockProcessResult() });

  on('session.cwd', () => ({ value: '/repo' }));
  on('classic.SessionStart', () => ({}));
  on('tool.call', () => buildMockCallResult({ deny: undefined, text: undefined }));
  on('process.run', processRun.hook);

  // oxlint-disable-next-line new-cap -- The host event API retains its event spelling.
  await $.classic.SessionStart({
    ...buildMockSessionContext({ session_id: 'session-1' }),
    source: 'startup',
  });

  const before = Date.now();

  await $.tool.call({ tool: 'Bash', tool_use_id: 'call-1', command: 'git switch -c fix/a' });

  const after = Date.now();
  const [call] = processRun.calls;

  assertDefined(call);
  assertDefined(call.request);

  // oxlint-disable-next-line typescript/dot-notation -- noPropertyAccessFromIndexSignature needs brackets.
  const startedAt = call.request['startedAt'];

  expect(call.request).toStrictEqual({
    sessionID: 'session-1',
    cwd: '/repo',
    startedAt: expect.any(Number),
    command: 'git switch -c fix/a',
    resultText: '',
  });

  expect(startedAt).toBeGreaterThanOrEqual(before);
  expect(startedAt).toBeLessThanOrEqual(after);
});
