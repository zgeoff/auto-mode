import { expect, test } from 'bun:test';
import invariant from 'tiny-invariant';
import { repositoryContextSchema } from './repository-context-schema.ts';

test('it accepts a checkout on a named branch', () => {
  const payload = { cwd: '/work/repo', branch: 'feature', defaultBranch: 'main' };

  expect(repositoryContextSchema.safeParse(payload).data).toStrictEqual(payload);
});

test('it accepts a detached checkout with no known default branch', () => {
  const payload = { cwd: '/work/repo', branch: null, defaultBranch: null };

  expect(repositoryContextSchema.safeParse(payload).data).toStrictEqual(payload);
});

test('it rejects a context with no working directory', () => {
  const result = repositoryContextSchema.safeParse({
    cwd: null,
    branch: 'feature',
    defaultBranch: 'main',
  });

  invariant(result.error !== undefined);

  expect(result.error.issues).toPartiallyContain({ path: ['cwd'] });
});

test('it rejects a context that leaves the branch out', () => {
  const result = repositoryContextSchema.safeParse({ cwd: '/work/repo', defaultBranch: 'main' });

  invariant(result.error !== undefined);

  expect(result.error.issues).toPartiallyContain({ path: ['branch'] });
});
