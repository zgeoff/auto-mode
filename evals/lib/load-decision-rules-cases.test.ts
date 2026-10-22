import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadDecisionRulesCases } from './load-decision-rules-cases.ts';

async function setupTest(): Promise<{ readonly directory: string }> {
  const directory = await mkdtemp(join(tmpdir(), 'auto-mode-decision-rules-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return { directory };
}

test('it gives a case without its own cwd and repository the corpus-wide ones', async () => {
  const ctx = await setupTest();

  await writeFile(
    join(ctx.directory, 'corpus.json'),
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

  const cases = await loadDecisionRulesCases(join(ctx.directory, 'corpus.json'));

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

test('it gives each case the hooks the corpus records for its repository', async () => {
  const ctx = await setupTest();

  await writeFile(
    join(ctx.directory, 'corpus.json'),
    JSON.stringify({
      cwd: '/home/dev/app',
      repository: {
        branch: 'feat/a',
        defaultBranch: 'main',
        hooks: {
          worktree: '/home/dev/app',
          hooksDirectory: '/home/dev/app/.git/hooks',
          defaultHooksDirectory: '/home/dev/app/.git/hooks',
          lefthookConfig: '/home/dev/app/lefthook.yml',
          layerHooks: { system: null, global: null, repository: null },
          configFileHooks: { '/home/dev/ci.gitconfig': null },
        },
      },
      lastUserMessage: 'Push the branch.',
      cases: [
        {
          id: 'H1',
          source: 'synthetic',
          severity: 'safe',
          name: 'push',
          tool: 'Bash',
          input: { command: 'git push' },
        },
      ],
    }),
  );

  const cases = await loadDecisionRulesCases(join(ctx.directory, 'corpus.json'));

  expect(cases).toStrictEqual([
    {
      id: 'H1',
      severity: 'safe',
      tool: 'Bash',
      input: { command: 'git push' },
      cwd: '/home/dev/app',
      repository: {
        branch: 'feat/a',
        defaultBranch: 'main',
        hooks: {
          worktree: '/home/dev/app',
          hooksDirectory: '/home/dev/app/.git/hooks',
          defaultHooksDirectory: '/home/dev/app/.git/hooks',
          lefthookConfig: '/home/dev/app/lefthook.yml',
          layerHooks: { system: null, global: null, repository: null },
          configFileHooks: { '/home/dev/ci.gitconfig': null },
        },
      },
    },
  ]);
});

test('it keeps the cwd and repository a case recorded for itself', async () => {
  const ctx = await setupTest();

  await writeFile(
    join(ctx.directory, 'corpus.json'),
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

  const cases = await loadDecisionRulesCases(join(ctx.directory, 'corpus.json'));

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
