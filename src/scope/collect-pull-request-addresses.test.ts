import { expect, test } from 'bun:test';
import { collectPullRequestAddresses } from './collect-pull-request-addresses.ts';

test('it collects every PR address in the output once, in order', () => {
  expect(
    collectPullRequestAddresses(
      'https://github.com/dev/app/pull/3\nWarning: 1 uncommitted change\nhttps://github.com/Dev/App/pull/41\nhttps://github.com/dev/app/pull/3\n',
    ),
  ).toStrictEqual([
    { repository: 'github.com/dev/app', number: 3 },
    { repository: 'github.com/dev/app', number: 41 },
  ]);
});

test('it collects no address from output without one', () => {
  expect(collectPullRequestAddresses('pull request create failed: GraphQL error')).toStrictEqual(
    [],
  );
});
