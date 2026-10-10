import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
// disappears, or arrives is a change to what every classifier reads.
test('it assembles the shipped policy in a fixed order', async () => {
  const prompt = await loadPolicy();

  const sections = prompt.split('\n').filter((line) => line.startsWith('## '));

  expect(sections).toStrictEqual([
    '## Threat model',
    '## Environment',
    '## Scope',
    '## The default is allow',
    '## The two block tiers',
    '## User intent',
    '## Evaluation rules',
    '## HARD BLOCK rules',
    '## SOFT BLOCK rules',
    '## ALLOW exceptions',
    '## How to evaluate an action',
    '## Output contract',
  ]);
});

test('it assembles the shipped decision framework when asked for it', async () => {
  const prompt = await loadPolicy({}, 'decision.md');

  const sections = prompt.split('\n').filter((line) => line.startsWith('## '));

  expect(sections).toStrictEqual([
    '## Environment and harm',
    '## Permission precedence',
    '## False-positive clarification',
    '## Evidence limits',
    '## Action evaluation',
    '## HARD BLOCK rules',
    '## SOFT BLOCK rules',
    '## ALLOW exceptions',
  ]);
});

test.each([
  ['a source edit needs no branch evidence', 'This does not require branch evidence'],
  [
    'Default Branch Write needs no branch evidence to set a non-Git edit apart',
    'branch evidence is not required for that distinction',
  ],
  [
    'the branch references cover cwd only',
    "The branch references describe cwd only, not the edited file's checkout or a generated script's future execution cwd",
  ],
  ['a generated script keeps its own checkout', 'do not assume it inherits repositoryContext'],
  [
    'a retargeted command loses the branch evidence',
    "do not apply the original checkout's branch evidence to that target",
  ],
])('it keeps the guidance that %s in the decision framework', (_label, guidance) => {
  expect(loadPolicy({}, 'decision.md')).resolves.toInclude(guidance);
});

test('it keeps the verified feature worktree requirement out of the decision framework', () => {
  expect(loadPolicy({}, 'decision.md')).resolves.not.toInclude('verified feature worktree');
});

test('it puts the rules where the marker was', async () => {
  const ctx = await setupTest();

  await writeFile(ctx.classifierPath, 'before\n\n<rules>\n\nafter\n');
  await writeFile(ctx.rulesPath, '  RULES  ');

  const prompt = await loadPolicy({ classifierPath: ctx.classifierPath, rulesPath: ctx.rulesPath });

  expect(prompt).toBe('before\n\nRULES\n\nafter\n');
});

// A classifier file with no marker would silently drop every rule, which reads
// as a policy that blocks nothing. Fail loudly instead.
test('it refuses a classifier file that has nowhere to put the rules', async () => {
  const ctx = await setupTest();

  await writeFile(ctx.classifierPath, 'no marker here');
  await writeFile(ctx.rulesPath, 'RULES');

  expect(
    loadPolicy({ classifierPath: ctx.classifierPath, rulesPath: ctx.rulesPath }),
  ).rejects.toThrowWithMessage(Error, /has no <rules> line/u);
});
