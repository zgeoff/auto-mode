import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { findExecutable } from './find-executable.ts';

async function setupTest() {
  const dir = await mkdtemp(join(tmpdir(), 'auto-mode-find-executable-'));

  onTestFinished(() => rm(dir, { recursive: true, force: true }));

  return { dir };
}

test('it finds the first executable of that name along the PATH', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.dir, 'first'));
  await mkdir(join(ctx.dir, 'second'));
  await writeFile(join(ctx.dir, 'second', 'claude'), '#!/bin/sh\n', { mode: 0o755 });
  await writeFile(join(ctx.dir, 'first', 'claude'), '#!/bin/sh\n', { mode: 0o755 });

  expect(
    findExecutable('claude', [join(ctx.dir, 'first'), join(ctx.dir, 'second')].join(delimiter)),
  ).toBe(join(ctx.dir, 'first', 'claude'));
});

test('it passes over a file of that name that is not executable', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.dir, 'first'));
  await mkdir(join(ctx.dir, 'second'));
  await writeFile(join(ctx.dir, 'first', 'claude'), 'text\n', { mode: 0o644 });
  await writeFile(join(ctx.dir, 'second', 'claude'), '#!/bin/sh\n', { mode: 0o755 });

  expect(
    findExecutable('claude', [join(ctx.dir, 'first'), join(ctx.dir, 'second')].join(delimiter)),
  ).toBe(join(ctx.dir, 'second', 'claude'));
});

test('it passes over a directory of that name', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.dir, 'claude'));

  expect(findExecutable('claude', ctx.dir)).toBeNull();
});

test('it finds nothing without a PATH', () => {
  expect(findExecutable('claude', undefined)).toBeNull();
});
