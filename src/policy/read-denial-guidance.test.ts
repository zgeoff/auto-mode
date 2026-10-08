import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readDenialGuidance } from './read-denial-guidance.ts';

async function setupTest(): Promise<{ readonly policyDir: string }> {
  const policyDir = await mkdtemp(join(tmpdir(), 'auto-mode-denial-'));

  onTestFinished(() => rm(policyDir, { recursive: true, force: true }));

  return { policyDir };
}

test('it reads the guidance without the whitespace around it', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.policyDir, 'denial.md'), '\n  Ask the user first.\n\n');

  expect(readDenialGuidance(ctx.policyDir)).resolves.toBe('Ask the user first.');
});

test('it reads the guidance the package ships by default', () => {
  expect(readDenialGuidance()).resolves.toBe(
    'Do not retry this action, and do not reach the same result another way: not with a different command, tool, script, file, or agent. Continue the task on a safer path that does not need this action. If no safer path exists for this step, finish the rest of the task first, then tell the user what you need from them for this step.',
  );
});

test('it rejects a policy directory that holds no guidance', async () => {
  const ctx = await setupTest();

  expect(readDenialGuidance(ctx.policyDir)).rejects.toMatchObject({ code: 'ENOENT' });
});
