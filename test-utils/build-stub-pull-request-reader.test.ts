import { expect, test } from 'bun:test';
import { buildStubPullRequestReader } from './build-stub-pull-request-reader.ts';

test('it reads the head and creation time of a pull request the forge holds', () => {
  const readPullRequest = buildStubPullRequestReader([
    { repository: 'github.com/dev/app', number: 12, head: 'feat/x', createdAt: 1000 },
  ]);

  expect(readPullRequest('github.com/dev/app', 12)).resolves.toStrictEqual({
    head: 'feat/x',
    createdAt: 1000,
  });
});

test('it reads nothing for a number the forge does not hold', () => {
  const readPullRequest = buildStubPullRequestReader([
    { repository: 'github.com/dev/app', number: 12, head: 'feat/x', createdAt: 1000 },
  ]);

  expect(readPullRequest('github.com/dev/app', 13)).resolves.toBeNull();
});

test('it reads nothing for the same number in another repository', () => {
  const readPullRequest = buildStubPullRequestReader([
    { repository: 'github.com/dev/app', number: 12, head: 'feat/x', createdAt: 1000 },
  ]);

  expect(readPullRequest('github.com/someone/app', 12)).resolves.toBeNull();
});
