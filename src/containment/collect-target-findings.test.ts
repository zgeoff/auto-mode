import { expect, test } from 'bun:test';
import { buildMockOwnedScope } from '../../test-utils/factories/build-mock-owned-scope.ts';
import { collectTargetFindings } from './collect-target-findings.ts';

test('it finds a relative target outside the task scope by its resolved path', () => {
  expect(
    collectTargetFindings(
      '/repo/.worktrees/a',
      '../b/x.ts',
      buildMockOwnedScope({ home: '/home/dev', worktrees: ['/repo/.worktrees/a'] }),
      [],
    ),
  ).toStrictEqual([{ kind: 'path', target: '/repo/.worktrees/b/x.ts', grant: { kind: 'path' } }]);
});

test('it finds a target in a credential directory as a credential, even inside the scope', () => {
  expect(
    collectTargetFindings(
      '/home/dev',
      '~/.aws/credentials',
      buildMockOwnedScope({ home: '/home/dev', worktrees: ['/home/dev'] }),
      [],
    ),
  ).toStrictEqual([{ kind: 'credential', target: '/home/dev/.aws/credentials' }]);
});

test('it finds nothing in a target inside the task scope', () => {
  expect(
    collectTargetFindings(
      '/repo/.worktrees/a',
      'src/x.ts',
      buildMockOwnedScope({ home: '/home/dev', worktrees: ['/repo/.worktrees/a'] }),
      [],
    ),
  ).toStrictEqual([]);
});

test('it finds nothing in a target it cannot resolve', () => {
  expect(
    collectTargetFindings(
      '/repo/.worktrees/a',
      '$OUT/x.ts',
      buildMockOwnedScope({ home: '/home/dev', worktrees: ['/repo/.worktrees/a'] }),
      [],
    ),
  ).toStrictEqual([]);
});
