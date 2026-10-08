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
