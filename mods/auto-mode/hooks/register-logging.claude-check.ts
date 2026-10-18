import { expect, test } from 'claude-code/testing';
import { buildStubProcessRun } from './test-utils/build-stub-process-run.ts';
import { buildMockPermissionDecision } from './test-utils/factories/build-mock-permission-decision.ts';
import { buildMockProcessResult } from './test-utils/factories/build-mock-process-result.ts';
import { buildMockSessionContext } from './test-utils/factories/build-mock-session-context.ts';

test('it logs the invocation and the fallback without copying child output', async ($, on) => {
  const decided = buildMockPermissionDecision({ decision: 'ask' });
  const logs: { readonly text: string; readonly to: string | undefined }[] = [];

  on('ui.log', (_api, event) => {
    logs.push({ text: event.text, to: event.to });

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
    { text: 'auto-mode action unavailable: evaluator invoked', to: 'debug' },
    {
      text: 'auto-mode action unavailable: manual approval retained; no usable verdict; inspect action diagnostics',
      to: 'debug',
    },
  ]);
});

test('it logs a subprocess failure when the child run fails', async ($, on) => {
  const decided = buildMockPermissionDecision({ decision: 'ask' });
  const logs: { readonly text: string; readonly to: string | undefined }[] = [];

  on('ui.log', (_api, event) => {
    logs.push({ text: event.text, to: event.to });

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
    { text: 'auto-mode action unavailable: evaluator invoked', to: 'debug' },
    {
      text: 'auto-mode action unavailable: manual approval retained; subprocess failure',
      to: 'debug',
    },
  ]);
});

test('it names a call_ action ID in its log lines', async ($, on) => {
  const logs: { readonly text: string; readonly to: string | undefined }[] = [];

  on('ui.log', (_api, event) => {
    logs.push({ text: event.text, to: event.to });

    return { value: undefined };
  });

  on('classic.SessionStart', () => ({}));
  on('session.cwd', () => ({ value: '/repo' }));
  on('tool.check', () => buildMockPermissionDecision({ decision: 'ask' }));
  on('process.run', buildStubProcessRun({ result: buildMockProcessResult() }).hook);

  // oxlint-disable-next-line new-cap -- The host event API retains its event spelling.
  await $.classic.SessionStart({ ...buildMockSessionContext(), source: 'startup' });

  await $.tool.check({
    tool: 'Bash',
    input: { command: 'rm fixture.txt' },
    tool_use_id: 'call_0123456789abcdef01234567',
  });

  expect(logs).toStrictEqual([
    {
      text: 'auto-mode action call_0123456789abcdef01234567: evaluation skipped; untracked tool call',
      to: 'debug',
    },
  ]);
});
