import { expect, test } from 'bun:test';
import { buildMockScopeFinding } from './build-mock-scope-finding.ts';

test('it builds a default scope finding', () => {
  expect(buildMockScopeFinding()).toStrictEqual({ kind: 'path', target: expect.toBeString() });
});

test('it applies overrides on top of the defaults', () => {
  expect(buildMockScopeFinding({ kind: 'branch', target: 'main' })).toStrictEqual({
    kind: 'branch',
    target: 'main',
  });
});
