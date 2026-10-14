import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readContainmentRule } from './read-containment-rule.ts';

async function setupTest(): Promise<{ readonly policyDir: string }> {
  const policyDir = await mkdtemp(join(tmpdir(), 'auto-mode-containment-rule-'));

  onTestFinished(() => rm(policyDir, { recursive: true, force: true }));

  return { policyDir };
}

test('it reads the rule without the whitespace around it', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.policyDir, 'containment.md'), '\n### Outside Task Scope\nA rule.\n\n');

  expect(readContainmentRule(ctx.policyDir)).resolves.toBe('### Outside Task Scope\nA rule.');
});

test('it reads the rule the package ships by default, which asks for the operation and every target', () => {
  expect(readContainmentRule()).resolves.toSatisfy(
    (text: string) =>
      text.startsWith('### Outside Task Scope\n') &&
      text.endsWith('**Must name:** the operation and every target.'),
  );
});

test('it rejects a policy directory that holds no containment rule', async () => {
  const ctx = await setupTest();

  expect(readContainmentRule(ctx.policyDir)).rejects.toMatchObject({ code: 'ENOENT' });
});
