import { expect, test } from 'claude-code/testing';
import { buildStubProcessRun } from './build-stub-process-run.ts';
import { buildMockProcessResult } from './factories/build-mock-process-result.ts';

test('it answers a run with the given result', () => {
  const result = buildMockProcessResult({ stdout: '{"decision":"allow"}' });
  const processRun = buildStubProcessRun({ result });

  expect(processRun.hook(null, { argv: ['auto-mode', 'run'] })).toStrictEqual({ value: result });
});

test('it records the arguments, the time limit and the JSON request on stdin', () => {
  const processRun = buildStubProcessRun({ result: buildMockProcessResult() });

  processRun.hook(null, {
    argv: ['auto-mode', 'record'],
    init: { timeoutMs: 8000, stdin: '{"sessionID":"session-1","cwd":"/repo"}' },
  });

  expect(processRun.calls).toStrictEqual([
    {
      argv: ['auto-mode', 'record'],
      timeoutMs: 8000,
      request: { sessionID: 'session-1', cwd: '/repo' },
    },
  ]);
});

test('it records no request for a run without stdin', () => {
  const processRun = buildStubProcessRun({ result: buildMockProcessResult() });

  processRun.hook(null, { argv: ['auto-mode', 'run'] });

  expect(processRun.calls).toStrictEqual([
    { argv: ['auto-mode', 'run'], timeoutMs: undefined, request: undefined },
  ]);
});

test('it records no request for stdin that is not a JSON object', () => {
  const processRun = buildStubProcessRun({ result: buildMockProcessResult() });

  processRun.hook(null, { argv: ['auto-mode', 'run'], init: { stdin: '["allow"]' } });

  expect(processRun.calls).toStrictEqual([
    { argv: ['auto-mode', 'run'], timeoutMs: undefined, request: undefined },
  ]);
});

test('it records a failing run and throws its failure text to the host', () => {
  const processRun = buildStubProcessRun({ failure: 'synthetic child failure' });

  expect(() => processRun.hook(null, { argv: ['auto-mode', 'run'] })).toThrow(
    'synthetic child failure',
  );

  expect(processRun.calls).toStrictEqual([
    { argv: ['auto-mode', 'run'], timeoutMs: undefined, request: undefined },
  ]);
});
