import { expect, test } from 'bun:test';
import { buildMockOwnedScope } from '../../test-utils/factories/build-mock-owned-scope.ts';
import { isOwnedPullRequest } from './is-owned-pull-request.ts';

test.each([
  ['its own repository', 'dev/app', true],
  ['its repository with a host', 'github.com/dev/app', true],
  ['its repository with a .git suffix', 'dev/app.git', true],
  ['another repository', 'other/app', false],
])('it reads an owned number in %s as owned: %p', (_label, repo, expected) => {
  expect(
    isOwnedPullRequest(
      12,
      repo,
      buildMockOwnedScope({ pullRequests: [{ number: 12, repository: 'github.com/dev/app' }] }),
    ),
  ).toBe(expected);
});

test('it reads an owned number named without a repository as owned when every remote holds it', () => {
  expect(
    isOwnedPullRequest(
      12,
      undefined,
      buildMockOwnedScope({
        remotes: [{ name: 'origin', url: 'git@github.com:dev/app.git' }],
        pullRequests: [{ number: 12, repository: 'github.com/dev/app' }],
      }),
    ),
  ).toBe(true);
});

test('it reads no number named without a repository as owned when the remotes hold two', () => {
  expect(
    isOwnedPullRequest(
      12,
      undefined,
      buildMockOwnedScope({
        remotes: [
          { name: 'origin', url: 'git@github.com:dev/app.git' },
          { name: 'upstream', url: 'git@github.com:team/app.git' },
        ],
        pullRequests: [{ number: 12, repository: 'github.com/dev/app' }],
      }),
    ),
  ).toBe(false);
});
