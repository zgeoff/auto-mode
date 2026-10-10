import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { buildStubOutput } from '../../test-utils/build-stub-output.ts';
import { defineExperiment } from './define-experiment.ts';
import { loadCaseKeys } from './load-case-keys.ts';
import { runEvalCommand } from './run-eval-command.ts';

async function setupTest() {
  const resultsDir = await mkdtemp(join(tmpdir(), 'eval-command-'));

  onTestFinished(() => rm(resultsDir, { recursive: true, force: true }));

  return {
    resultsDir,
    repoRoot: resolve(import.meta.dirname, '../..'),
    stdout: buildStubOutput(),
    stderr: buildStubOutput(),
  };
}

test('it prints the usage and exits 2 without a command', async () => {
  const ctx = await setupTest();

  const code = await runEvalCommand([], {
    stdout: ctx.stdout.write,
    stderr: ctx.stderr.write,
    env: {},
    repoRoot: ctx.repoRoot,
    experiments: [],
    prepareRun: () => Promise.reject(new Error('unreachable')),
    now: () => new Date('2026-10-10T12:00:00.000Z'),
  });

  expect(code).toBe(2);
  expect(ctx.stderr.read()).toStartWith('Usage:\n  bun run eval list\n');
  expect(ctx.stdout.read()).toBe('');
});

test.each<[string, string[], string]>([
  ['an unknown command', ['inspect'], 'Unknown command: inspect'],
  ['an unknown experiment', ['run', 'nope'], 'Unknown experiment: nope. Known: local-check.'],
  ['--live without a cap', ['run', 'local-check', '--live'], '--live needs --max-requests <n>.'],
  [
    'a cap without --live',
    ['run', 'local-check', '--max-requests', '5'],
    '--max-requests applies only with --live.',
  ],
  [
    'a seed that is not a number',
    ['run', 'local-check', '--seed', 'x'],
    '--seed takes a whole number, not x.',
  ],
  ['one run to compare', ['compare', 'a'], 'compare takes two run directories.'],
])('it exits 2 with the problem and the usage for %s', async (_label, argv, problem) => {
  const ctx = await setupTest();

  const code = await runEvalCommand(argv, {
    stdout: ctx.stdout.write,
    stderr: ctx.stderr.write,
    env: {},
    repoRoot: ctx.repoRoot,
    experiments: [
      defineExperiment({
        name: 'local-check',
        description: 'A deterministic stage.',
        corpus: 'containment',
        samples: 1,
        loadCases: async (dir) => {
          const loaded = await loadCaseKeys(dir);

          return new Map(loaded.keys.map((key) => [key, key]));
        },
        stages: [],
        measurements: [],
      }),
    ],
    prepareRun: () => Promise.reject(new Error('unreachable')),
    now: () => new Date('2026-10-10T12:00:00.000Z'),
  });

  expect(code).toBe(2);
  expect(ctx.stderr.read()).toStartWith(`${problem}\n\nUsage:`);
});

test('it lists each experiment with its corpus, stages and default samples', async () => {
  const ctx = await setupTest();

  const code = await runEvalCommand(['list'], {
    stdout: ctx.stdout.write,
    stderr: ctx.stderr.write,
    env: {},
    repoRoot: ctx.repoRoot,
    experiments: [
      defineExperiment({
        name: 'local-check',
        description: 'A deterministic stage.',
        corpus: 'containment',
        samples: 2,
        loadCases: () => Promise.resolve(new Map<string, string>()),
        stages: [
          {
            name: 'containment',
            sends: false,
            run: () => Promise.resolve({ status: 'skipped', reason: 'none' }),
          },
          {
            name: 'jev',
            sends: true,
            run: () => Promise.resolve({ status: 'skipped', reason: 'none' }),
          },
        ],
        measurements: [],
      }),
    ],
    prepareRun: () => Promise.reject(new Error('unreachable')),
    now: () => new Date('2026-10-10T12:00:00.000Z'),
  });

  expect(code).toBe(0);

  expect(ctx.stdout.read()).toBe(
    'local-check\n  A deterministic stage.\n  corpus containment; stages containment, jev (model); 2 samples by default\n',
  );
});

test('it refuses to write results inside the public repository', async () => {
  const ctx = await setupTest();

  const code = await runEvalCommand(
    ['run', 'local-check', '--results', join(ctx.repoRoot, 'evals/results')],
    {
      stdout: ctx.stdout.write,
      stderr: ctx.stderr.write,
      env: {},
      repoRoot: ctx.repoRoot,
      experiments: [
        defineExperiment({
          name: 'local-check',
          description: 'A deterministic stage.',
          corpus: 'containment',
          samples: 1,
          loadCases: async (dir) => {
            const loaded = await loadCaseKeys(dir);

            return new Map(loaded.keys.map((key) => [key, key]));
          },
          stages: [],
          measurements: [],
        }),
      ],
      prepareRun: () => Promise.reject(new Error('unreachable')),
      now: () => new Date('2026-10-10T12:00:00.000Z'),
    },
  );

  expect(code).toBe(1);

  expect(ctx.stderr.read()).toBe(
    `Refusing to write results inside the public repository: ${join(ctx.repoRoot, 'evals/results')}\n`,
  );
});

test('it writes a run into the directory AUTO_MODE_EVALS_DIR names', async () => {
  const ctx = await setupTest();

  const code = await runEvalCommand(['run', 'local-check'], {
    stdout: ctx.stdout.write,
    stderr: ctx.stderr.write,
    env: { AUTO_MODE_EVALS_DIR: ctx.resultsDir },
    repoRoot: ctx.repoRoot,
    experiments: [
      defineExperiment({
        name: 'local-check',
        description: 'A deterministic stage.',
        corpus: 'containment',
        samples: 1,
        loadCases: async (dir) => {
          const loaded = await loadCaseKeys(dir);

          return new Map(loaded.keys.map((key) => [key, key]));
        },
        stages: [
          {
            name: 'containment',
            sends: false,
            run: () => Promise.resolve({ status: 'skipped', reason: 'none' }),
          },
        ],
        measurements: [],
      }),
    ],
    prepareRun: () =>
      Promise.resolve({ publicCommit: 'test', policy: 'policy', configuredRules: {}, send: null }),
    now: () => new Date('2026-10-10T12:00:00.000Z'),
  });

  expect(code).toBe(0);

  const runs = await readdir(join(ctx.resultsDir, 'runs/local-check'));

  expect(runs).toStrictEqual([expect.toStartWith('20261010T120000Z-')]);
});

test('it refuses to compare runs of different experiments', async () => {
  const ctx = await setupTest();

  const io = {
    stdout: ctx.stdout.write,
    stderr: ctx.stderr.write,
    env: { AUTO_MODE_EVALS_DIR: ctx.resultsDir },
    repoRoot: ctx.repoRoot,
    experiments: [
      defineExperiment({
        name: 'first-check',
        description: 'A deterministic stage.',
        corpus: 'containment',
        samples: 1,
        loadCases: async (dir) => {
          const loaded = await loadCaseKeys(dir);

          return new Map(loaded.keys.map((key) => [key, key]));
        },
        stages: [],
        measurements: [],
      }),
      defineExperiment({
        name: 'second-check',
        description: 'A deterministic stage.',
        corpus: 'containment',
        samples: 1,
        loadCases: async (dir) => {
          const loaded = await loadCaseKeys(dir);

          return new Map(loaded.keys.map((key) => [key, key]));
        },
        stages: [],
        measurements: [],
      }),
    ],
    prepareRun: () =>
      Promise.resolve({ publicCommit: 'test', policy: 'policy', configuredRules: {}, send: null }),
    now: () => new Date('2026-10-10T12:00:00.000Z'),
  };

  await runEvalCommand(['run', 'first-check'], io);
  await runEvalCommand(['run', 'second-check'], io);

  const [first] = await readdir(join(ctx.resultsDir, 'runs/first-check'));
  const [second] = await readdir(join(ctx.resultsDir, 'runs/second-check'));

  const stderr = buildStubOutput();

  const code = await runEvalCommand(
    [
      'compare',
      join(ctx.resultsDir, 'runs/first-check', first ?? ''),
      join(ctx.resultsDir, 'runs/second-check', second ?? ''),
    ],
    { ...io, stderr: stderr.write },
  );

  expect(code).toBe(1);

  expect(stderr.read()).toBe(
    'Refusing to compare different experiments: first-check and second-check.\n',
  );
});
