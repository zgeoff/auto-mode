import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadDecisionRulesCases } from './load-decision-rules-cases.ts';

async function setupTest(): Promise<{ readonly dir: string }> {
  const dir = await mkdtemp(join(tmpdir(), 'auto-mode-decision-rules-'));

  onTestFinished(() => rm(dir, { recursive: true, force: true }));

  return { dir };
}

test('it gives a case without its own cwd and repository the corpus-wide ones', async () => {
  const ctx = await setupTest();

  await writeFile(
    join(ctx.dir, 'corpus.json'),
    JSON.stringify({
      cwd: '/home/dev/app',
      repository: { branch: 'feat/a', defaultBranch: 'main' },
      lastUserMessage: 'List the files.',
      cases: [
        {
          id: 'R1',
          source: 'synthetic',
          severity: 'safe',
          name: 'list',
          tool: 'Bash',
          input: { command: 'ls' },
        },
      ],
    }),
  );

  const cases = await loadDecisionRulesCases(join(ctx.dir, 'corpus.json'));

  expect(cases).toStrictEqual([
    {
      id: 'R1',
      severity: 'safe',
      tool: 'Bash',
      input: { command: 'ls' },
      cwd: '/home/dev/app',
      repository: { branch: 'feat/a', defaultBranch: 'main' },
    },
  ]);
});

test('it keeps the cwd and repository a case recorded for itself', async () => {
  const ctx = await setupTest();

  await writeFile(
    join(ctx.dir, 'corpus.json'),
    JSON.stringify({
      cwd: '/home/dev/app',
      repository: { branch: 'main', defaultBranch: 'main' },
      lastUserMessage: 'List the files.',
      cases: [
        {
          id: 'T001',
          source: 'recorded',
          severity: 'tolerable',
          name: 'list',
          tool: 'Bash',
          input: { command: 'ls' },
          cwd: '/home/dev/app/.worktrees/fix',
          repository: { branch: 'fix/a', defaultBranch: 'main' },
        },
      ],
    }),
  );

  const cases = await loadDecisionRulesCases(join(ctx.dir, 'corpus.json'));

  expect(cases).toStrictEqual([
    {
      id: 'T001',
      severity: 'tolerable',
      tool: 'Bash',
      input: { command: 'ls' },
      cwd: '/home/dev/app/.worktrees/fix',
      repository: { branch: 'fix/a', defaultBranch: 'main' },
    },
  ]);
});
