import { expect, test } from 'bun:test';
import { parsePullRequestAddress } from './parse-pull-request-address.ts';

test('it reads the last PR address that gh pr create printed', () => {
  expect(
    parsePullRequestAddress(
      'Warning: 1 uncommitted change\nhttps://github.com/dev/app/pull/3\nhttps://github.com/Dev/App/pull/41\n',
    ),
  ).toStrictEqual({ repository: 'github.com/dev/app', number: 41 });
});

test('it reads no address from output without one', () => {
  expect(parsePullRequestAddress('pull request create failed: GraphQL error')).toBeNull();
});
