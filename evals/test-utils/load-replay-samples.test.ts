import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadReplaySamples } from './load-replay-samples.ts';

async function setupTest(): Promise<{ readonly dir: string }> {
  const dir = await mkdtemp(join(tmpdir(), 'auto-mode-replay-samples-'));

  onTestFinished(() => rm(dir, { recursive: true, force: true }));

  return { dir };
}

test('it pairs each replay sample with the case it replays', async () => {
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

  await writeFile(
    join(ctx.dir, 'replay.json'),
    JSON.stringify({
      records: [
        ['R1', 1, 1],
        ['R1', 2, 0],
      ],
    }),
  );

  const samples = await loadReplaySamples(
    join(ctx.dir, 'corpus.json'),
    join(ctx.dir, 'replay.json'),
  );

  expect(samples).toStrictEqual([
    {
      case: {
        id: 'R1',
        severity: 'safe',
        tool: 'Bash',
        input: { command: 'ls' },
        cwd: '/home/dev/app',
        repository: { branch: 'feat/a', defaultBranch: 'main' },
      },
      sample: 1,
      released: true,
    },
    {
      case: {
        id: 'R1',
        severity: 'safe',
        tool: 'Bash',
        input: { command: 'ls' },
        cwd: '/home/dev/app',
        repository: { branch: 'feat/a', defaultBranch: 'main' },
      },
      sample: 2,
      released: false,
    },
  ]);
});

test('it rejects a replay sample of a case the corpus lacks', async () => {
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

  await writeFile(join(ctx.dir, 'replay.json'), JSON.stringify({ records: [['R2', 1, 1]] }));

  expect(
    loadReplaySamples(join(ctx.dir, 'corpus.json'), join(ctx.dir, 'replay.json')),
  ).rejects.toThrowWithMessage(Error, /the corpus lacks: R2/u);
});
