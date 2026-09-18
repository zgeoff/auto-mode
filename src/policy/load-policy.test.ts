import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import invariant from 'tiny-invariant';
import { loadPolicy } from './load-policy.ts';

async function setupTest(): Promise<{
  readonly classifierPath: string;
  readonly rulesPath: string;
}> {
  const dir = await mkdtemp(join(tmpdir(), 'auto-mode-policy-'));

  onTestFinished(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  return { classifierPath: join(dir, 'classifier.md'), rulesPath: join(dir, 'rules.md') };
}

test('it reads the shipped policy and leaves no marker behind', async () => {
  const prompt = await loadPolicy();

  expect(prompt).not.toInclude('<rules>');
});

// The splice is the product, so its shape is pinned. A section that moves,
// disappears, or arrives is a change to what every classifier reads, and
// regenerating this with `bun test -u` is reviewed like any other change.
test('it assembles the shipped policy in a fixed order', async () => {
  const prompt = await loadPolicy();

  const sections = prompt
    .split('\n')
    .filter((line) => line.startsWith('## '))
    .join('\n');

  expect(sections).toMatchInlineSnapshot(`
    "## Threat model
    ## Scope
    ## The default is allow
    ## The two block tiers
    ## User intent
    ## Evaluation rules
    ## HARD BLOCK rules
    ## SOFT BLOCK rules
    ## ALLOW exceptions
    ## How to evaluate an action
    ## Output contract"
  `);
});

test('it puts the rules where the marker was', async () => {
  const ctx = await setupTest();

  await writeFile(ctx.classifierPath, 'before\n\n<rules>\n\nafter\n');
  await writeFile(ctx.rulesPath, '  RULES  ');

  const prompt = await loadPolicy(ctx);

  expect(prompt).toBe('before\n\nRULES\n\nafter\n');
});

// A classifier file with no marker would silently drop every rule, which reads
// as a policy that blocks nothing. Fail loudly instead.
test('it refuses a classifier file that has nowhere to put the rules', async () => {
  const ctx = await setupTest();

  await writeFile(ctx.classifierPath, 'no marker here');
  await writeFile(ctx.rulesPath, 'RULES');

  const failure = await loadPolicy(ctx).catch((error: unknown) => error);

  invariant(failure instanceof Error, 'a classifier with no marker rejects with an Error');

  expect(failure.message).toInclude('has no <rules> line');
});
