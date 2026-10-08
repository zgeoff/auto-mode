import { expect, test } from 'bun:test';
import { createMockActionRequest } from '../../test-utils/factories/create-mock-action-request.ts';
import { buildActionHash } from './build-action-hash.ts';

test('it hashes the same action the same way whatever its key order', () => {
  const first = createMockActionRequest({
    cwd: '/repo',
    toolName: 'Bash',
    toolInput: { command: 'git push', description: 'push' },
  });

  const second = createMockActionRequest({
    cwd: '/repo',
    toolName: 'Bash',
    toolInput: { description: 'push', command: 'git push' },
  });

  expect(buildActionHash(first)).toBe(buildActionHash(second));
});

test('it hashes the same command in another directory as another action', () => {
  const here = createMockActionRequest({ cwd: '/repo/a', toolInput: { command: 'rm x' } });
  const there = createMockActionRequest({ cwd: '/repo/b', toolInput: { command: 'rm x' } });

  expect(buildActionHash(here)).not.toBe(buildActionHash(there));
});
