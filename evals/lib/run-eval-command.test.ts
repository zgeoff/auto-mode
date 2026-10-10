import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, readdir, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { buildStubOutput } from '../../test-utils/build-stub-output.ts';
import { runGit } from '../../test-utils/run-git.ts';
import { defineExperiment } from './define-experiment.ts';
import { buildMockActionLogRecord } from './factories/build-mock-action-log-record.ts';
import { loadCaseKeys } from './load-case-keys.ts';
import { runEvalCommand } from './run-eval-command.ts';

async function setupTest() {
  const tempDir = await mkdtemp(join(tmpdir(), 'eval-command-'));

  onTestFinished(() => rm(tempDir, { recursive: true, force: true }));

  // A run is written only into a clone of the results repository.
  const resultsDir = await realpath(tempDir);

  runGit(resultsDir, ['init', '-q', '-b', 'main']);
  runGit(resultsDir, ['remote', 'add', 'origin', 'git@github.com:zgeoff/auto-mode-evals.git']);

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
    home: '/nonexistent',
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
    'a recording with --live',
    ['run', 'local-check', '--live', '--max-requests', '5', '--recorded', 'baseline'],
    '--recorded replays answers and sends nothing; drop --live.',
  ],
  [
    'a seed that is not a number',
    ['run', 'local-check', '--seed', 'x'],
    '--seed takes a whole number, not x.',
  ],
  ['one run to compare', ['compare', 'a'], 'compare takes two run directories.'],
  [
    'a since that is not a time',
    ['live', '--since', 'x'],
    '--since takes an ISO 8601 time, not x.',
  ],
])('it exits 2 with the problem and the usage for %s', async (_label, argv, problem) => {
  const ctx = await setupTest();

  const code = await runEvalCommand(argv, {
    stdout: ctx.stdout.write,
    stderr: ctx.stderr.write,
    env: {},
    home: '/nonexistent',
    repoRoot: ctx.repoRoot,
    experiments: [
      defineExperiment({
        name: 'local-check',
        description: 'A deterministic stage.',
        corpora: ['containment'],
        samples: 1,
        loadCases: () => Promise.resolve({ sets: [], inputs: [], notMeasured: [] }),
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

test('it lists each experiment with its corpora, stages, default samples and recordings', async () => {
  const ctx = await setupTest();

  const code = await runEvalCommand(['list'], {
    stdout: ctx.stdout.write,
    stderr: ctx.stderr.write,
    env: {},
    home: '/nonexistent',
    repoRoot: ctx.repoRoot,
    experiments: [
      defineExperiment({
        name: 'local-check',
        description: 'A deterministic stage.',
        corpora: ['containment', 'second-judge'],
        samples: 2,
        recordings: [{ name: 'baseline', description: 'the baseline answers' }],
        loadCases: () => Promise.resolve({ sets: [], inputs: [], notMeasured: [] }),
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
    'local-check\n  A deterministic stage.\n  corpora containment, second-judge; stages containment, jev (model); 2 samples by default\n  recording baseline: the baseline answers\n',
  );
});

test('it refuses to write results inside the public repository', async () => {
  const ctx = await setupTest();

  const code = await runEvalCommand(
    ['run', 'local-check', '--results', join(ctx.repoRoot, 'evals')],
    {
      stdout: ctx.stdout.write,
      stderr: ctx.stderr.write,
      env: {},
      home: '/nonexistent',
      repoRoot: ctx.repoRoot,
      experiments: [
        defineExperiment({
          name: 'local-check',
          description: 'A deterministic stage.',
          corpora: ['containment'],
          samples: 1,
          loadCases: () => Promise.resolve({ sets: [], inputs: [], notMeasured: [] }),
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
    `Refusing to write results inside the public repository: ${await realpath(join(ctx.repoRoot, 'evals'))}\n`,
  );
});

test('it refuses a results path that links into the public repository', async () => {
  const ctx = await setupTest();

  const link = join(ctx.resultsDir, 'linked-results');

  await symlink(join(ctx.repoRoot, 'evals'), link);

  const code = await runEvalCommand(['run', 'local-check', '--results', link], {
    stdout: ctx.stdout.write,
    stderr: ctx.stderr.write,
    env: {},
    home: '/nonexistent',
    repoRoot: ctx.repoRoot,
    experiments: [
      defineExperiment({
        name: 'local-check',
        description: 'A deterministic stage.',
        corpora: ['containment'],
        samples: 1,
        loadCases: () => Promise.resolve({ sets: [], inputs: [], notMeasured: [] }),
        stages: [],
        measurements: [],
      }),
    ],
    prepareRun: () => Promise.reject(new Error('unreachable')),
    now: () => new Date('2026-10-10T12:00:00.000Z'),
  });

  expect(code).toBe(1);

  expect(ctx.stderr.read()).toBe(
    `Refusing to write results inside the public repository: ${await realpath(join(ctx.repoRoot, 'evals'))}\n`,
  );
});

test('it refuses a results path below the root of the results clone', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.resultsDir, 'runs'));

  const code = await runEvalCommand(
    ['run', 'local-check', '--results', join(ctx.resultsDir, 'runs')],
    {
      stdout: ctx.stdout.write,
      stderr: ctx.stderr.write,
      env: {},
      home: '/nonexistent',
      repoRoot: ctx.repoRoot,
      experiments: [
        defineExperiment({
          name: 'local-check',
          description: 'A deterministic stage.',
          corpora: ['containment'],
          samples: 1,
          loadCases: () => Promise.resolve({ sets: [], inputs: [], notMeasured: [] }),
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
    `Name the root of the results clone, ${ctx.resultsDir}, not ${join(ctx.resultsDir, 'runs')}.\n`,
  );
});

test('it writes a run into the clone AUTO_MODE_EVALS_DIR names and prints its counts', async () => {
  const ctx = await setupTest();

  const code = await runEvalCommand(['run', 'local-check'], {
    stdout: ctx.stdout.write,
    stderr: ctx.stderr.write,
    env: { AUTO_MODE_EVALS_DIR: ctx.resultsDir },
    home: '/nonexistent',
    repoRoot: ctx.repoRoot,
    experiments: [
      defineExperiment({
        name: 'local-check',
        description: 'A deterministic stage.',
        corpora: ['containment'],
        samples: 1,
        loadCases: async (source) => {
          const dir = join(source.corporaDir, 'containment');

          const loaded = await loadCaseKeys(dir);

          return {
            sets: [
              {
                corpus: 'containment',
                dir,
                cases: Object.fromEntries(loaded.keys.map((key) => [key, key])),
              },
            ],
            inputs: [],
            notMeasured: ['held-out set: not part of this check'],
          };
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
      Promise.resolve({
        publicCommit: 'test',
        dirtyTree: false,
        policy: 'policy',
        judgePolicy: 'judge policy',
        configuredRules: { environment: [], allow: [], soft_deny: [], hard_deny: [] },
        send: null,
        sendWithChoices: null,
        sendJudge: null,
      }),
    now: () => new Date('2026-10-10T12:00:00.000Z'),
  });

  expect(code).toBe(0);

  const runs = await readdir(join(ctx.resultsDir, 'runs/local-check'));

  expect(runs).toStrictEqual([expect.toStartWith('20261010T120000Z-')]);

  expect(ctx.stdout.read()).toBe(
    [
      'Plan: 13 cases × 1 samples × 1 stages; 13 stage runs to go, 0 already recorded, 0 model requests.',
      'Not measured: held-out set: not part of this check',
      `Wrote ${join(ctx.resultsDir, 'runs/local-check', runs[0] ?? '')}`,
      'not measured: held-out set: not part of this check',
      'not scorable / containment: 0/0 (13 skipped)',
      '',
    ].join('\n'),
  );
});

test('it refuses to compare runs of different experiments', async () => {
  const ctx = await setupTest();

  const io = {
    stdout: ctx.stdout.write,
    stderr: ctx.stderr.write,
    env: { AUTO_MODE_EVALS_DIR: ctx.resultsDir },
    home: '/nonexistent',
    repoRoot: ctx.repoRoot,
    experiments: [
      defineExperiment({
        name: 'first-check',
        description: 'A deterministic stage.',
        corpora: ['containment'],
        samples: 1,
        loadCases: () => Promise.resolve({ sets: [], inputs: [], notMeasured: [] }),
        stages: [],
        measurements: [],
      }),
      defineExperiment({
        name: 'second-check',
        description: 'A deterministic stage.',
        corpora: ['containment'],
        samples: 1,
        loadCases: () => Promise.resolve({ sets: [], inputs: [], notMeasured: [] }),
        stages: [],
        measurements: [],
      }),
    ],
    prepareRun: () =>
      Promise.resolve({
        publicCommit: 'test',
        dirtyTree: false,
        policy: 'policy',
        judgePolicy: 'judge policy',
        configuredRules: { environment: [], allow: [], soft_deny: [], hard_deny: [] },
        send: null,
        sendWithChoices: null,
        sendJudge: null,
      }),
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

test('it measures the action log the state directory holds and prints the measures', async () => {
  const ctx = await setupTest();

  const stateDir = join(ctx.resultsDir, 'state', 'auto-mode');

  await mkdir(stateDir, { recursive: true });

  await writeFile(
    join(stateDir, 'actions.jsonl'),
    `${JSON.stringify(
      buildMockActionLogRecord({
        time: '2026-10-01T10:00:00.000Z',
        status: 'deny',
        verdict: 'deny',
        decidingStage: 'jev',
      }),
    )}\n{"schemaVersion":3,`,
  );

  const code = await runEvalCommand(['live', '--results', ctx.resultsDir], {
    stdout: ctx.stdout.write,
    stderr: ctx.stderr.write,
    env: { XDG_STATE_HOME: join(ctx.resultsDir, 'state') },
    home: '/nonexistent',
    repoRoot: ctx.repoRoot,
    experiments: [],
    prepareRun: () => Promise.reject(new Error('unreachable')),
    now: () => new Date('2026-10-10T12:00:00.000Z'),
  });

  const [runID] = await readdir(join(ctx.resultsDir, 'runs/live-use'));

  expect(code).toBe(0);

  expect(ctx.stdout.read()).toBe(
    [
      `Wrote ${join(ctx.resultsDir, 'runs/live-use', runID ?? '')}`,
      'records: 1 (0 started, 1 final, 0 incomplete) from 2 lines; 0 before --since; skipped none',
      'Dropped a torn last line (19 characters).',
      'tasks: 1, from 2026-10-01T10:00:00.000Z to 2026-10-01T10:00:00.000Z',
      'escalations per task: 0/1 (mean 0, standard error n/a)',
      'tasks with an escalation / all / recorded: 0/1 cases (1 cases; Wilson 0–0.7935)',
      'tasks that recover after a deny / all / recorded: 0/1 cases (1 cases; Wilson 0–0.7935)',
      'denials per action / all / recorded: 1/1 actions (1 cases, design effect 1, effective n 1; Wilson 0.2065–1)',
      'denials per action / jev / recorded: 1/1 actions (1 cases, design effect 1, effective n 1; Wilson 0.2065–1)',
      '',
    ].join('\n'),
  );
});

test('it refuses to measure live use without a results clone', async () => {
  const ctx = await setupTest();

  const code = await runEvalCommand(['live', '--log', join(ctx.resultsDir, 'actions.jsonl')], {
    stdout: ctx.stdout.write,
    stderr: ctx.stderr.write,
    env: {},
    home: '/nonexistent',
    repoRoot: ctx.repoRoot,
    experiments: [],
    prepareRun: () => Promise.reject(new Error('unreachable')),
    now: () => new Date('2026-10-10T12:00:00.000Z'),
  });

  expect(code).toBe(2);

  expect(ctx.stderr.read()).toStartWith(
    'live writes to the results clone: pass --results or set AUTO_MODE_EVALS_DIR.\n\nUsage:',
  );
});
