import { expect, test } from 'bun:test';
import { buildMockScopeRecordRequest } from './build-mock-scope-record-request.ts';

test('it builds a default scope record request', () => {
  expect(buildMockScopeRecordRequest()).toStrictEqual({
    sessionID: expect.toBeString(),
    cwd: expect.toStartWith('/'),
    startedAt: expect.toBeNumber(),
    command: expect.toBeString(),
    resultText: '',
  });
});

test('it applies overrides on top of the defaults', () => {
  expect(
    buildMockScopeRecordRequest({
      cwd: '/work/app',
      command: 'gh pr create --fill',
      resultText: 'https://github.com/dev/app/pull/12\n',
    }),
  ).toStrictEqual({
    sessionID: expect.toBeString(),
    cwd: '/work/app',
    startedAt: expect.toBeNumber(),
    command: 'gh pr create --fill',
    resultText: 'https://github.com/dev/app/pull/12\n',
  });
});
