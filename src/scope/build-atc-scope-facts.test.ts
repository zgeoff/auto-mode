import { expect, test } from 'bun:test';
import { buildStubRepositoryMembership } from '../../test-utils/build-stub-repository-membership.ts';
import { buildMockAtcSessionRecord } from '../../test-utils/factories/build-mock-atc-session-record.ts';
import { buildAtcScopeFacts } from './build-atc-scope-facts.ts';

test('it owns every declared checkout and the branches that live in the action repository', () => {
  const record = buildMockAtcSessionRecord({
    scope: {
      workspace: { path: '/repo/.worktrees/feat', branch: 'feat' },
      worktrees: [
        { path: '/repo/.worktrees/extra', branch: 'extra' },
        { path: '/other/.worktrees/x', branch: 'x' },
      ],
      branches: [
        { name: 'later', repo: '/repo' },
        { name: 'elsewhere', repo: '/other' },
        { name: 'plain' },
      ],
    },
  });

  const facts = buildAtcScopeFacts(record, buildStubRepositoryMembership('/repo').isInRepository);

  expect(facts).toStrictEqual({
    worktrees: ['/repo/.worktrees/feat', '/repo/.worktrees/extra', '/other/.worktrees/x'],
    branches: ['feat', 'extra', 'later', 'plain'],
    pullRequests: [],
    pathGlobs: [],
  });
});

test('it owns no branch when no declared path shares the action repository', () => {
  const record = buildMockAtcSessionRecord({
    scope: {
      workspace: { path: '/repo/.worktrees/feat', branch: 'feat' },
      worktrees: [{ path: '/repo/.worktrees/extra', branch: 'extra' }],
      branches: [{ name: 'later', repo: '/repo' }, { name: 'plain' }],
    },
  });

  const facts = buildAtcScopeFacts(record, () => false);

  expect(facts).toStrictEqual({
    worktrees: ['/repo/.worktrees/feat', '/repo/.worktrees/extra'],
    branches: [],
    pullRequests: [],
    pathGlobs: [],
  });
});

test('it owns no branch for a declared checkout with none checked out', () => {
  const record = buildMockAtcSessionRecord({
    scope: { workspace: { path: '/repo', branch: null } },
  });

  const facts = buildAtcScopeFacts(record, () => true);

  expect(facts).toStrictEqual({
    worktrees: ['/repo'],
    branches: [],
    pullRequests: [],
    pathGlobs: [],
  });
});

test('it owns each declared PR with a head branch, on the host its URL names or GitHub', () => {
  const record = buildMockAtcSessionRecord({
    scope: {
      workspace: { path: '/repo', branch: 'feat' },
      pullRequests: [
        { repo: 'dev/app', number: 12, branch: 'feat' },
        { repo: 'dev/app', number: 13, branch: null },
        {
          repo: 'team/lib',
          number: 4,
          url: 'https://git.example.com/team/lib/pull/4',
          branch: 'feat',
        },
      ],
    },
  });

  const facts = buildAtcScopeFacts(record, () => true);

  expect(facts).toStrictEqual({
    worktrees: ['/repo'],
    branches: ['feat'],
    pullRequests: [
      { number: 12, head: 'feat', repository: 'github.com/dev/app' },
      { number: 4, head: 'feat', repository: 'git.example.com/team/lib' },
    ],
    pathGlobs: [],
  });
});
