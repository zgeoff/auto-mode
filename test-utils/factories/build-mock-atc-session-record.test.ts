import { expect, test } from 'bun:test';
import { buildMockAtcSessionRecord } from './build-mock-atc-session-record.ts';

test('it builds a default atc session record', () => {
  expect(buildMockAtcSessionRecord()).toStrictEqual({
    format: 'atc.session-record',
    version: 1,
    session: expect.toBeString(),
    scope: {
      workspace: { path: expect.toStartWith('/'), branch: expect.toBeString() },
      worktrees: [],
      branches: [],
      pullRequests: [],
    },
  });
});

test('it applies overrides on top of the defaults', () => {
  const record = buildMockAtcSessionRecord({
    session: 'session-1',
    scope: { workspace: { path: '/repo' }, branches: [{ name: 'feature' }] },
  });

  expect(record).toStrictEqual({
    format: 'atc.session-record',
    version: 1,
    session: 'session-1',
    scope: {
      workspace: { path: '/repo', branch: expect.toBeString() },
      worktrees: [],
      branches: [{ name: 'feature' }],
      pullRequests: [],
    },
  });
});
