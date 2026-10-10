import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadCaseKeys } from './load-case-keys.ts';

async function setupTest(): Promise<{ readonly dir: string }> {
  const dir = await mkdtemp(join(tmpdir(), 'auto-mode-case-keys-'));

  onTestFinished(() => rm(dir, { recursive: true, force: true }));

  return { dir };
}

test('it keys the applicability cases by name', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.dir, 'applicability'));

  await writeFile(
    join(ctx.dir, 'applicability/cases.json'),
    JSON.stringify({
      cases: [
        { name: 'ordinary source write', kind: 'safe' },
        { name: 'default-branch PR merge', kind: 'risk' },
      ],
    }),
  );

  const keys = await loadCaseKeys(join(ctx.dir, 'applicability'));

  expect(keys).toStrictEqual({
    key: 'name',
    keys: ['ordinary source write', 'default-branch PR merge'],
  });
});

test('it keys the decision-rules cases by id across both of its files', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.dir, 'decision-rules'));

  await writeFile(
    join(ctx.dir, 'decision-rules/consent-near-miss.json'),
    JSON.stringify({
      cwd: '/home/dev/app',
      repository: { branch: 'feat/a', defaultBranch: 'main' },
      lastUserMessage: '',
      cases: [
        {
          id: 'publish:twin',
          source: 'synthetic',
          severity: 'safe',
          name: 'publish',
          tool: 'Bash',
          input: { command: 'npm publish' },
        },
      ],
    }),
  );

  await writeFile(
    join(ctx.dir, 'decision-rules/real-traffic.json'),
    JSON.stringify({
      cwd: '/home/dev/app',
      repository: { branch: 'feat/a', defaultBranch: 'main' },
      lastUserMessage: '',
      cases: [
        {
          id: 'T001',
          source: 'recorded',
          severity: 'safe',
          name: 'list',
          tool: 'Bash',
          input: { command: 'ls' },
        },
      ],
    }),
  );

  const keys = await loadCaseKeys(join(ctx.dir, 'decision-rules'));

  expect(keys).toStrictEqual({
    key: 'id',
    keys: ['publish:twin', 'T001'],
  });
});

test('it keys each stale-consent pair once per arm', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.dir, 'stale-consent'));

  await writeFile(
    join(ctx.dir, 'stale-consent/cases.json'),
    JSON.stringify({
      cwd: '/home/dev/app',
      staleOrigin: 'composer',
      pairs: [1, 2, 3, 4, 5, 6].map((pair) => ({
        pair,
        action: 'push',
        name: `push ${String(pair)}`,
        variant: 'earlier-consent',
        firstArm: 'stale',
        staleMessage: 'Push it.',
        tool: 'Bash',
        input: { command: 'git push' },
        repositoryContext: null,
      })),
    }),
  );

  const keys = await loadCaseKeys(join(ctx.dir, 'stale-consent'));

  expect(keys).toStrictEqual({
    key: 'pair/arm',
    keys: [
      '1/stale',
      '1/null',
      '2/stale',
      '2/null',
      '3/stale',
      '3/null',
      '4/stale',
      '4/null',
      '5/stale',
      '5/null',
      '6/stale',
      '6/null',
    ],
  });
});

test('it keys each relay-consent action once per cell of its label', async () => {
  const keys = await loadCaseKeys('evals/corpora/relay-consent');

  expect(keys.key).toBe('action/cell');
  expect(keys.keys).toHaveLength(6 * 11 + 2 * 5);

  expect(keys.keys).toIncludeAllMembers([
    'push-retry-budget/current-consent',
    'push-retry-budget/mark-unrelated',
    'commit-feature-branch/absent',
  ]);

  expect(keys.keys).not.toContain('commit-feature-branch/current-consent');
});

test('it keys the task-scope sessions by name', async () => {
  const keys = await loadCaseKeys('evals/corpora/task-scope');

  expect(keys).toStrictEqual({ key: 'name', keys: ['glm-A', 'glm-B', 'root-A', 'root-B'] });
});

test('it rejects a folder that is not a known corpus', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.dir, 'recorded'));

  expect(loadCaseKeys(join(ctx.dir, 'recorded'))).rejects.toThrowWithMessage(
    Error,
    'No case keys are defined for the corpus recorded.',
  );
});
