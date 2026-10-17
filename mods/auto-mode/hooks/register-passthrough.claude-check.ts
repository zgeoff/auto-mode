import { expect, test } from 'claude-code/testing';
import { buildStubProcessRun } from './test-utils/build-stub-process-run.ts';
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

test('it retains manual approval for a tool input that is not an object', async ($, on) => {
  const decided = buildMockPermissionDecision({ decision: 'ask' });

  const processRun = buildStubProcessRun({
    result: buildMockProcessResult({ stdout: '{"decision":"allow"}' }),
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
  await $.classic.SessionStart({ ...buildMockSessionContext(), source: 'startup' });

  const result = await $.tool.check({ tool: 'Bash', input: ['rm -rf dist'] });

  expect(result).toStrictEqual(decided);
  expect(processRun.calls).toStrictEqual([]);

  expect(logs).toStrictEqual([
    'auto-mode action unavailable: evaluation skipped; tool input is not an object',
  ]);
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

test('it retains manual approval before the session context arrives', async ($, on) => {
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
  on('process.run', processRun.hook);

  const result = await $.tool.check({
    tool: 'Bash',
    input: { command: 'git push origin feature', timeout: 120_000 },
  });

  expect(result).toStrictEqual(decided);

  expect(logs).toStrictEqual([
    {
      text: 'auto-mode action unavailable: evaluation skipped; missing session context',
      to: 'debug',
    },
  ]);

  expect(processRun.calls).toStrictEqual([]);
});

test('it skips evaluation for a tool call it never saw start', async ($, on) => {
  const decided = buildMockPermissionDecision({ decision: 'ask' });
  const processRun = buildStubProcessRun({ result: buildMockProcessResult() });
  const logs: { readonly text: string; readonly to: string | undefined }[] = [];

  on('ui.log', (_api, e) => {
    logs.push({ text: e.text, to: e.to });

    return { value: undefined };
  });

  on('classic.SessionStart', () => ({}));
  on('session.cwd', () => ({ value: '/repo' }));
  on('tool.check', () => decided);
  on('process.run', processRun.hook);

  // oxlint-disable-next-line new-cap -- The host event API retains its event spelling.
  await $.classic.SessionStart({ ...buildMockSessionContext(), source: 'startup' });

  const result = await $.tool.check({
    tool: 'Bash',
    input: { command: 'rm fixture.txt' },
    tool_use_id: 'toolu_01',
  });

  expect(result).toStrictEqual(decided);
  expect(processRun.calls).toStrictEqual([]);

  expect(logs).toStrictEqual([
    { text: 'auto-mode action unavailable: evaluation skipped; untracked tool call', to: 'debug' },
  ]);
});

test('it passes the spawn result through unchanged', async ($, on) => {
  on('agent.spawn', () => ({ agentId: 'worker', model: 'sonnet' }));

  const result = await $.agent.spawn({ prompt: 'Fix the parser.' });

  expect(result).toStrictEqual({ agentId: 'worker', model: 'sonnet' });
});

test('it passes a denied spawn through unchanged', async ($, on) => {
  on('agent.spawn', () => ({ deny: 'no' }));

  const result = await $.agent.spawn({ prompt: 'Fix the parser.' });

  expect(result).toStrictEqual({ deny: 'no' });
});
