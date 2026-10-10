import { expect, test } from 'bun:test';
import { JudgeRequestError } from './judge-request-error.ts';

test('it carries its failure reason and the transport error as its cause', () => {
  const cause = new Error('socket hang up');
  const error = new JudgeRequestError('request', { cause });

  expect(error).toMatchObject({
    name: 'JudgeRequestError',
    message: 'The judge request failed: request.',
    reason: 'request',
    cause,
  });
});
