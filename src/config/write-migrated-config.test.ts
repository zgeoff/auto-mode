import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import invariant from 'tiny-invariant';
import { loadConfig } from './config.ts';
import { writeMigratedConfig } from './write-migrated-config.ts';

async function setupTest(): Promise<{ readonly configFile: string }> {
  const dir = await mkdtemp(join(tmpdir(), 'auto-mode-migrate-'));

  onTestFinished(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  return { configFile: join(dir, 'config.json') };
}

test('it rewrites an old-shape file in place and keeps the original beside it', async () => {
  const ctx = await setupTest();

  const legacy = JSON.stringify({ preset: 'claude', onFailure: 'deny' });

  await writeFile(ctx.configFile, legacy);

  const { warnings: _legacyWarnings, ...before } = await loadConfig(ctx.configFile);
  const message = await writeMigratedConfig(ctx.configFile);

  expect(message).toBe(
    `rewrote ${ctx.configFile} in the current shape; the old file is at ${ctx.configFile}.bak`,
  );

  const backup = await readFile(`${ctx.configFile}.bak`, 'utf8');
  const rewritten = await readFile(ctx.configFile, 'utf8');

  expect(backup).toBe(legacy);

  expect(JSON.parse(rewritten)).toStrictEqual({
    classifiers: { claude: {} },
    decision: { classifier: 'claude', onFailure: 'deny' },
  });

  const { warnings, ...after } = await loadConfig(ctx.configFile);

  expect(after).toStrictEqual(before);
  expect(warnings).toStrictEqual([]);
});

test('it leaves a file in the current shape alone', async () => {
  const ctx = await setupTest();

  const current = JSON.stringify({ decision: { classifier: 'jev' } });

  await writeFile(ctx.configFile, current);

  const message = await writeMigratedConfig(ctx.configFile);

  expect(message).toBe(`${ctx.configFile} already uses the current shape`);

  const after = await readFile(ctx.configFile, 'utf8');

  expect(after).toBe(current);
});

test('it reports a missing file instead of creating one', async () => {
  const ctx = await setupTest();
  const message = await writeMigratedConfig(ctx.configFile);

  expect(message).toBe(`${ctx.configFile} does not exist; nothing to migrate`);
});

test('it refuses to overwrite an existing backup', async () => {
  const ctx = await setupTest();

  const legacy = JSON.stringify({ preset: 'jev' });

  await writeFile(ctx.configFile, legacy);
  await writeFile(`${ctx.configFile}.bak`, 'an older backup');

  const failure = await writeMigratedConfig(ctx.configFile).catch((error: unknown) => error);

  invariant(failure instanceof Error, 'an existing backup rejects with an Error');

  const backup = await readFile(`${ctx.configFile}.bak`, 'utf8');
  const config = await readFile(ctx.configFile, 'utf8');

  expect(failure.message).toBe(
    `${ctx.configFile}.bak already exists; move it aside and run the migration again`,
  );

  expect(backup).toBe('an older backup');
  expect(config).toBe(legacy);
});
