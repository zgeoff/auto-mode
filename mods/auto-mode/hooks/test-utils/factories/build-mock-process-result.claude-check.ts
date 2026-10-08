import { expect, test } from 'claude-code/testing';
import { buildMockProcessResult } from './build-mock-process-result.ts';

test('it builds a default process result', () => {
  expect(buildMockProcessResult()).toStrictEqual({
    exitCode: 0,
    stdout: '',
    stderr: 'synthetic-private-fragment',
    isStdoutTruncated: false,
    isStderrTruncated: false,
  });
});

test('it applies overrides on top of the defaults', () => {
  expect(buildMockProcessResult({ exitCode: 1, stdout: '{"decision":"allow"}' })).toStrictEqual({
    exitCode: 1,
    stdout: '{"decision":"allow"}',
    stderr: 'synthetic-private-fragment',
    isStdoutTruncated: false,
    isStderrTruncated: false,
  });
});
