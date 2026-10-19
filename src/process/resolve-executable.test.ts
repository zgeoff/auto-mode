import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { resolveExecutable } from './resolve-executable.ts';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'auto-mode-resolve-executable-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return { directory };
}

test('it finds the first executable of that name along the PATH', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.directory, 'first'));
  await mkdir(join(ctx.directory, 'second'));
  await writeFile(join(ctx.directory, 'second', 'claude'), '#!/bin/sh\n', { mode: 0o755 });
  await writeFile(join(ctx.directory, 'first', 'claude'), '#!/bin/sh\n', { mode: 0o755 });

  expect(
    resolveExecutable(
      'claude',
      [join(ctx.directory, 'first'), join(ctx.directory, 'second')].join(delimiter),
    ),
  ).toBe(join(ctx.directory, 'first', 'claude'));
});

test('it passes over a file of that name that is not executable', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.directory, 'first'));
  await mkdir(join(ctx.directory, 'second'));
  await writeFile(join(ctx.directory, 'first', 'claude'), 'text\n', { mode: 0o644 });
  await writeFile(join(ctx.directory, 'second', 'claude'), '#!/bin/sh\n', { mode: 0o755 });

  expect(
    resolveExecutable(
      'claude',
      [join(ctx.directory, 'first'), join(ctx.directory, 'second')].join(delimiter),
    ),
  ).toBe(join(ctx.directory, 'second', 'claude'));
});

test('it passes over a directory of that name', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.directory, 'claude'));

  expect(resolveExecutable('claude', ctx.directory)).toBeNull();
});

test('it finds nothing without a PATH', () => {
  expect(resolveExecutable('claude', undefined)).toBeNull();
});
