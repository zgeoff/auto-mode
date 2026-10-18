import { expect, test } from 'bun:test';
import { collectUnanonymisedHomeUsers } from './collect-unanonymised-home-users.ts';

test.each([
  ['an invented user', '/home/robin/projects/harbor'],
  ['an invented user before a full stop', 'It lives in /home/dev.'],
  ['an anonymiser placeholder', '/home/user-4843c5bd/projects/repo-b759ee7c'],
  ['an invented Windows user', String.raw`C:\Users\robin\harbor`],
  ['no home path', '/srv/harbor/.worktrees/fix-login'],
])('it accepts %s', (_label, text) => {
  expect(collectUnanonymisedHomeUsers(text)).toStrictEqual([]);
});

test('it returns each user that is neither invented nor a placeholder', () => {
  expect(
    collectUnanonymisedHomeUsers(
      'rm /home/pat/.ssh/authorized_keys; cat /Users/sam/notes.md, then C:/Users/lee/x',
    ),
  ).toStrictEqual(['pat', 'sam', 'lee']);
});
