import { expect, test } from 'claude-code/testing';
import { buildMockCallResult } from './build-mock-call-result.ts';

test('it builds a default call result', () => {
  expect(buildMockCallResult()).toStrictEqual({ result: { stdout: '', stderr: '' }, text: '' });
});

test('it applies overrides on top of the defaults', () => {
  expect(buildMockCallResult({ text: 'done\n' })).toStrictEqual({
    result: { stdout: '', stderr: '' },
    text: 'done\n',
  });
});

test('it builds a denied call result without output', () => {
  expect(buildMockCallResult({ deny: 'no' })).toStrictEqual({ deny: 'no' });
});

test('it leaves out a field whose override is undefined', () => {
  expect(buildMockCallResult({ text: undefined })).toStrictEqual({
    result: { stdout: '', stderr: '' },
  });
});
