import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as z from 'zod';
import { loadJSONFile } from './load-json-file.ts';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'auto-mode-load-json-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return { path: join(directory, 'state.json') };
}

test('it loads a file that matches the schema', async () => {
  const ctx = await setupTest();

  await writeFile(ctx.path, '{"count":2}\n');

  const loaded = await loadJSONFile(ctx.path, z.strictObject({ count: z.number() }), null);

  expect(loaded).toStrictEqual({ count: 2 });
});

test('it loads the fallback for a missing file', async () => {
  const ctx = await setupTest();
  const loaded = await loadJSONFile(ctx.path, z.strictObject({ count: z.number() }), null);

  expect(loaded).toBeNull();
});

test('it loads the fallback for a path it cannot read as a file', async () => {
  const ctx = await setupTest();

  await mkdir(ctx.path);

  const loaded = await loadJSONFile(ctx.path, z.strictObject({ count: z.number() }), null);

  expect(loaded).toBeNull();
});

test('it loads the fallback for a file that is not JSON', async () => {
  const ctx = await setupTest();

  await writeFile(ctx.path, '{"count":');

  const loaded = await loadJSONFile(ctx.path, z.strictObject({ count: z.number() }), null);

  expect(loaded).toBeNull();
});

test('it loads the fallback for JSON that does not match the schema', async () => {
  const ctx = await setupTest();

  await writeFile(ctx.path, '{"count":"two"}\n');

  const loaded = await loadJSONFile(ctx.path, z.strictObject({ count: z.number() }), {
    count: 0,
  });

  expect(loaded).toStrictEqual({ count: 0 });
});
