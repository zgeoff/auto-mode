import { expect, test } from 'bun:test';
import { toRepositorySlug } from './to-repository-slug.ts';

test.each([
  ['git@github.com:dev/app.git', 'github.com/dev/app'],
  ['ssh://git@github.com/dev/app.git', 'github.com/dev/app'],
  ['git+ssh://git@github.com/dev/app', 'github.com/dev/app'],
  ['https://github.com/dev/app.git', 'github.com/dev/app'],
  ['https://github.com/dev/app/', 'github.com/dev/app'],
  ['https://token@github.com/dev/app', 'github.com/dev/app'],
  ['https://GitHub.com/Dev/App.git', 'github.com/dev/app'],
  ['github.com/dev/app', 'github.com/dev/app'],
])('it reduces %s to %s', (reference, expected) => {
  expect(toRepositorySlug(reference)).toBe(expected);
});

test.each([
  ['app'],
  ['dev/app'],
  ['https://github.com/dev'],
  ['https://github.com/dev/app/pulls'],
  [''],
])('it reduces %p to nothing, since it names no host, owner and repository', (reference) => {
  expect(toRepositorySlug(reference)).toBeNull();
});
