import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { $ } from 'bun';

// The test script builds dist/ before the suite runs, so the check has an artifact to run.
async function setupTest(): Promise<{ readonly gitDirectory: string }> {
  const directory = await mkdtemp(join(tmpdir(), 'check-artifact-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  await $`git init --quiet ${directory}`.quiet();

  return { gitDirectory: join(directory, '.git') };
}

test('it passes when it inherits a GIT_DIR that points at another repository', async () => {
  const ctx = await setupTest();

  const result = await $`bun --no-env-file ${join(import.meta.dirname, 'check-artifact.ts')}`
    .env({ ...process.env, GIT_DIR: ctx.gitDirectory })
    .quiet()
    .nothrow();

  expect(result.stdout.toString()).toInclude('missing-key fallback passed');
  expect(result.exitCode).toBe(0);
});
