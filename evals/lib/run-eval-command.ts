import { join, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import type { Experiment } from './define-experiment.ts';
import { formatComparison } from './format-comparison.ts';
import { loadRun } from './load-run.ts';
import type { RunEnvironment } from './run-experiment.ts';
import { runExperiment } from './run-experiment.ts';

export interface EvalCommandIO {
  readonly stdout: (text: string) => boolean;
  readonly stderr: (text: string) => boolean;
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly repoRoot: string;
  readonly experiments: readonly Experiment<unknown>[];
  readonly prepareRun: (live: boolean) => Promise<RunEnvironment>;
  readonly now: () => Date;
}

const USAGE = `Usage:
  bun run eval list
  bun run eval run <experiment> [--live --max-requests <n>] [--resume <run-dir>]
                   [--seed <n>] [--samples <n>] [--results <dir>]
  bun run eval compare <run-dir-a> <run-dir-b>

Results go to --results, or else to AUTO_MODE_EVALS_DIR: a clone of the
private results repository, outside this repository.
`;

const DEFAULT_SEED = 1;

// Exit 2 is a usage error, exit 1 a refusal or failure.
export async function runEvalCommand(
  argv: readonly string[],
  io: Readonly<EvalCommandIO>,
): Promise<number> {
  const [command, ...rest] = argv;

  try {
    switch (command) {
      case 'list': {
        return rest.length === 0 ? printList(io) : printUsage(io, 'list takes no arguments.');
      }
      case 'run': {
        return await runCommand(rest, io);
      }
      case 'compare': {
        return await runCompareCommand(rest, io);
      }
      case undefined: {
        return printUsage(io, null);
      }
      default: {
        return printUsage(io, `Unknown command: ${command}`);
      }
    }
  } catch (error) {
    if (error instanceof UsageError) {
      return printUsage(io, error.message);
    }

    const message = error instanceof Error ? error.message : String(error);

    io.stderr(`${message}\n`);

    return 1;
  }
}

class UsageError extends Error {
  override readonly name = 'UsageError';
}

function printUsage(io: Readonly<EvalCommandIO>, problem: string | null): number {
  const text = problem === null ? USAGE : `${problem}\n\n${USAGE}`;

  io.stderr(text);

  return 2;
}

function printList(io: Readonly<EvalCommandIO>): number {
  for (const experiment of io.experiments) {
    const stages = experiment.stages
      .map((stage) => (stage.sends ? `${stage.name} (model)` : stage.name))
      .join(', ');

    io.stdout(
      `${experiment.name}\n  ${experiment.description}\n  corpus ${experiment.corpus}; stages ${stages}; ${experiment.samples} samples by default\n`,
    );
  }

  return 0;
}

async function runCommand(args: readonly string[], io: Readonly<EvalCommandIO>): Promise<number> {
  const parsed = parseCommandArgs(args, {
    live: { type: 'boolean' },
    'max-requests': { type: 'string' },
    resume: { type: 'string' },
    seed: { type: 'string' },
    samples: { type: 'string' },
    results: { type: 'string' },
  });

  const [name, ...extra] = parsed.positionals;

  if (name === undefined || extra.length > 0) {
    throw new UsageError('run takes one experiment name.');
  }

  const experiment = io.experiments.find((entry) => entry.name === name);

  if (experiment === undefined) {
    throw new UsageError(
      `Unknown experiment: ${name}. Known: ${io.experiments.map((entry) => entry.name).join(', ')}.`,
    );
  }

  const live = parsed.values.live === true;
  const maxRequests = parseCount(parsed.values['max-requests'], '--max-requests', null);

  if (live && maxRequests === null) {
    throw new UsageError('--live needs --max-requests <n>.');
  }

  if (!live && maxRequests !== null) {
    throw new UsageError('--max-requests applies only with --live.');
  }

  const resultsOption = parsed.values.results ?? io.env['AUTO_MODE_EVALS_DIR'] ?? null;
  const resultsDir = resultsOption === null ? null : resolve(resultsOption);
  const resumeDir = parsed.values.resume === undefined ? null : resolve(parsed.values.resume);

  for (const dir of [resultsDir, resumeDir]) {
    if (dir !== null && isInside(io.repoRoot, dir)) {
      throw new Error(`Refusing to write results inside the public repository: ${dir}`);
    }
  }

  const result = await runExperiment(experiment, {
    corporaDir: join(io.repoRoot, 'evals/corpora'),
    resultsDir,
    seed: parseCount(parsed.values.seed, '--seed', DEFAULT_SEED) ?? DEFAULT_SEED,
    samples:
      parseCount(parsed.values.samples, '--samples', experiment.samples) ?? experiment.samples,
    live,
    maxRequests,
    resumeDir,
    environment: await io.prepareRun(live),
    now: io.now,
    print: (line) => {
      io.stdout(`${line}\n`);
    },
  });

  if (result.kind === 'completed') {
    io.stdout(`Wrote ${result.runDir}\n`);

    for (const count of result.summary.counts) {
      io.stdout(
        `${count.measurement} / ${count.stage} / ${count.source}: ${count.events}/${count.total} ${count.unit} (${count.cases} cases)\n`,
      );
    }

    for (const failure of result.summary.notScorable) {
      io.stdout(
        `not scorable / ${failure.stage}: ${failure.notScorable}/${failure.attempted} (${failure.skipped} skipped)\n`,
      );
    }
  }

  return 0;
}

async function runCompareCommand(
  args: readonly string[],
  io: Readonly<EvalCommandIO>,
): Promise<number> {
  const parsed = parseCommandArgs(args, {});
  const [dirA, dirB, ...extra] = parsed.positionals;

  if (dirA === undefined || dirB === undefined || extra.length > 0) {
    throw new UsageError('compare takes two run directories.');
  }

  const [runA, runB] = await Promise.all([loadRun(resolve(dirA)), loadRun(resolve(dirB))]);

  const name = runA.summary.config.experiment;

  if (runB.summary.config.experiment !== name) {
    throw new Error(
      `Refusing to compare different experiments: ${name} and ${runB.summary.config.experiment}.`,
    );
  }

  const experiment = io.experiments.find((entry) => entry.name === name);

  if (experiment === undefined) {
    throw new Error(`No experiment named ${name} is defined.`);
  }

  io.stdout(
    formatComparison(
      {
        run: runA,
        observations: experiment.measurements.flatMap((measure) => measure(runA.records)),
      },
      {
        run: runB,
        observations: experiment.measurements.flatMap((measure) => measure(runB.records)),
      },
    ),
  );

  return 0;
}

type OptionSpec = Readonly<Record<string, { readonly type: 'boolean' | 'string' }>>;

function parseCommandArgs<Options extends OptionSpec>(args: readonly string[], options: Options) {
  try {
    return parseArgs({ args: [...args], options, allowPositionals: true, strict: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    throw new UsageError(message);
  }
}

function parseCount(
  value: string | undefined,
  flag: string,
  fallback: number | null,
): number | null {
  if (value === undefined) {
    return fallback;
  }

  if (!/^\d+$/.test(value)) {
    throw new UsageError(`${flag} takes a whole number, not ${value}.`);
  }

  return Number(value);
}

function isInside(root: string, dir: string): boolean {
  const path = relative(root, dir);

  return path === '' || (!path.startsWith('..') && !path.startsWith('/'));
}
