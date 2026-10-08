import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readPullRequest } from './read-pull-request.ts';

async function setupTest() {
  const dir = await mkdtemp(join(tmpdir(), 'auto-mode-read-pull-request-'));

  onTestFinished(() => rm(dir, { recursive: true, force: true }));

  return {
    dir,
    statePath: join(dir, 'pull-requests.json'),
    stubPath: join(import.meta.dir, '..', '..', 'test-utils', 'run-stub-gh.ts'),
  };
}

test('it reads the head and creation time of a pull request from gh', async () => {
  const ctx = await setupTest();

  await writeFile(
    ctx.statePath,
    JSON.stringify([
      {
        repository: 'github.com/dev/app',
        number: 12,
        headRefName: 'feat/a',
        createdAt: '2026-01-01T00:00:00Z',
      },
    ]),
  );

  const facts = await readPullRequest('github.com/dev/app', 12, {
    command: [process.execPath, ctx.stubPath, ctx.statePath],
  });

  expect(facts).toStrictEqual({ head: 'feat/a', createdAt: Date.parse('2026-01-01T00:00:00Z') });
});

test('it reads nothing for a pull request gh cannot find', async () => {
  const ctx = await setupTest();

  await writeFile(
    ctx.statePath,
    JSON.stringify([
      {
        repository: 'github.com/dev/app',
        number: 12,
        headRefName: 'feat/a',
        createdAt: '2026-01-01T00:00:00Z',
      },
    ]),
  );

  const facts = await readPullRequest('github.com/dev/app', 13, {
    command: [process.execPath, ctx.stubPath, ctx.statePath],
  });

  expect(facts).toBeNull();
});

test('it reads nothing when gh fails after it printed a row', async () => {
  const ctx = await setupTest();

  await writeFile(
    ctx.statePath,
    JSON.stringify([
      {
        repository: 'github.com/dev/app',
        number: 12,
        headRefName: 'feat/a',
        createdAt: '2026-01-01T00:00:00Z',
        exitCode: 1,
      },
    ]),
  );

  const facts = await readPullRequest('github.com/dev/app', 12, {
    command: [process.execPath, ctx.stubPath, ctx.statePath],
  });

  expect(facts).toBeNull();
});

test('it reads nothing when gh answers with an empty head', async () => {
  const ctx = await setupTest();

  await writeFile(
    ctx.statePath,
    JSON.stringify([
      {
        repository: 'github.com/dev/app',
        number: 12,
        headRefName: '',
        createdAt: '2026-01-01T00:00:00Z',
      },
    ]),
  );

  const facts = await readPullRequest('github.com/dev/app', 12, {
    command: [process.execPath, ctx.stubPath, ctx.statePath],
  });

  expect(facts).toBeNull();
});

test('it reads nothing when gh answers with a creation time that is not a date', async () => {
  const ctx = await setupTest();

  await writeFile(
    ctx.statePath,
    JSON.stringify([
      {
        repository: 'github.com/dev/app',
        number: 12,
        headRefName: 'feat/a',
        createdAt: 'yesterday',
      },
    ]),
  );

  const facts = await readPullRequest('github.com/dev/app', 12, {
    command: [process.execPath, ctx.stubPath, ctx.statePath],
  });

  expect(facts).toBeNull();
});

test('it reads nothing when gh cannot start', async () => {
  const ctx = await setupTest();

  const facts = await readPullRequest('github.com/dev/app', 12, {
    command: [join(ctx.dir, 'missing-gh')],
  });

  expect(facts).toBeNull();
});

test('it reads a pull request whose answer arrives within the default lookup time', async () => {
  const ctx = await setupTest();

  await writeFile(
    ctx.statePath,
    JSON.stringify([
      {
        repository: 'github.com/dev/app',
        number: 12,
        headRefName: 'feat/a',
        createdAt: '2026-01-01T00:00:00Z',
        delayMs: 500,
      },
    ]),
  );

  const facts = await readPullRequest('github.com/dev/app', 12, {
    command: [process.execPath, ctx.stubPath, ctx.statePath],
  });

  expect(facts).toStrictEqual({ head: 'feat/a', createdAt: Date.parse('2026-01-01T00:00:00Z') });
});

test('it reads nothing when gh answers after the lookup time', async () => {
  const ctx = await setupTest();

  await writeFile(
    ctx.statePath,
    JSON.stringify([
      {
        repository: 'github.com/dev/app',
        number: 12,
        headRefName: 'feat/a',
        createdAt: '2026-01-01T00:00:00Z',
        delayMs: 500,
      },
    ]),
  );

  const facts = await readPullRequest('github.com/dev/app', 12, {
    command: [process.execPath, ctx.stubPath, ctx.statePath],
    timeoutMs: 100,
  });

  expect(facts).toBeNull();
});
