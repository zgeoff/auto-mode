import { randomBytes } from 'node:crypto';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import * as z from 'zod';
import type { Experiment } from './define-experiment.ts';
import { formatComparison } from './format-comparison.ts';
import { loadRun } from './load-run.ts';
import { readPublicCommit } from './read-public-commit.ts';
import { requireResultsClone } from './require-results-clone.ts';
import { resolveActionLogPath } from './resolve-action-log-path.ts';
import type { RunEnvironment } from './run-experiment.ts';
import { runExperiment } from './run-experiment.ts';
import { runLiveUse } from './run-live-use.ts';
import type { MeasurementCount } from './run-summary-schema.ts';
import { writeAnonymisedCorpus } from './write-anonymised-corpus.ts';

export interface EvalCommandIO {
  readonly stdout: (text: string) => boolean;
  readonly stderr: (text: string) => boolean;
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly home: string;
  readonly repoRoot: string;
  readonly experiments: readonly Experiment<unknown>[];
  readonly prepareRun: (live: boolean) => Promise<RunEnvironment>;
  readonly now: () => Date;
}

const USAGE = `Usage:
  bun run eval list
  bun run eval run <experiment> [--live --max-requests <n> | --recorded <recording>]
                   [--resume <run-dir>] [--seed <n>] [--samples <n>] [--results <dir>]
  bun run eval compare <run-dir-a> <run-dir-b>
  bun run eval live [--log <path>] [--since <iso-time>] [--results <dir>]
  bun run eval anonymise <capture.jsonl...> --out <dir>

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
      case 'live': {
        return await runLiveCommand(rest, io);
      }
      case 'anonymise': {
        return await runAnonymiseCommand(rest, io);
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

    const recordings = experiment.recordings.map(
      (recording) => `\n  recording ${recording.name}: ${recording.description}`,
    );

    io.stdout(
      `${experiment.name}\n  ${experiment.description}\n  corpora ${experiment.corpora.join(', ')}; stages ${stages}; ${experiment.samples} samples by default${recordings.join('')}\n`,
    );
  }

  return 0;
}

async function runCommand(args: readonly string[], io: Readonly<EvalCommandIO>): Promise<number> {
  const parsed = parseCommandArgs(args, {
    live: { type: 'boolean' },
    'max-requests': { type: 'string' },
    recorded: { type: 'string' },
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

  const recording = parsed.values.recorded ?? null;

  if (live && recording !== null) {
    throw new UsageError('--recorded replays answers and sends nothing; drop --live.');
  }

  const resultsDir = await resolveResultsDir(
    parsed.values.results ?? io.env['AUTO_MODE_EVALS_DIR'] ?? null,
    io.repoRoot,
  );

  const resumeClone =
    parsed.values.resume === undefined
      ? null
      : await requireResultsClone(resolve(parsed.values.resume), io.repoRoot);

  const resumeDir = resumeClone?.dir ?? null;

  const result = await runExperiment(experiment, {
    corporaDir: join(io.repoRoot, 'evals/corpora'),
    resultsDir,
    recording,
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

    for (const entry of result.summary.notMeasured) {
      io.stdout(`not measured: ${entry}\n`);
    }

    printCounts(io, result.summary.counts);

    for (const failure of result.summary.notScorable) {
      const reasons = Object.entries(failure.reasons)
        .map(([reason, count]) => `${reason} ${count}`)
        .join(', ');

      io.stdout(
        `not scorable / ${failure.stage}: ${failure.notScorable}/${failure.attempted} (${failure.skipped} skipped)${reasons === '' ? '' : `: ${reasons}`}\n`,
      );
    }

    for (const latency of result.summary.latency) {
      io.stdout(
        `latency / ${latency.stage}: median ${latency.medianMs} ms, p90 ${latency.p90Ms} ms over ${latency.requests}\n`,
      );
    }

    for (const required of result.summary.requiredCases) {
      io.stdout(
        `required ${required.caseKey} / ${required.stage}: ${required.verdicts.join(' ')}\n`,
      );
    }
  }

  return 0;
}

function printCounts(io: Readonly<EvalCommandIO>, counts: readonly MeasurementCount[]): void {
  for (const count of counts) {
    const effective =
      count.effectiveTotal === null
        ? ''
        : `, design effect ${count.designEffect ?? 1}, effective n ${count.effectiveTotal}`;

    io.stdout(
      `${count.measurement} / ${count.stage} / ${count.source}: ${count.events}/${count.total} ${count.unit} (${count.cases} cases${effective}; Wilson ${count.wilson.lower}–${count.wilson.upper})\n`,
    );
  }
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

async function runLiveCommand(
  args: readonly string[],
  io: Readonly<EvalCommandIO>,
): Promise<number> {
  const parsed = parseCommandArgs(args, {
    log: { type: 'string' },
    since: { type: 'string' },
    results: { type: 'string' },
  });

  if (parsed.positionals.length > 0) {
    throw new UsageError('live takes no positional arguments.');
  }

  const since = parseSince(parsed.values.since);

  const resultsDir = await resolveResultsDir(
    parsed.values.results ?? io.env['AUTO_MODE_EVALS_DIR'] ?? null,
    io.repoRoot,
  );

  if (resultsDir === null) {
    throw new UsageError(
      'live writes to the results clone: pass --results or set AUTO_MODE_EVALS_DIR.',
    );
  }

  const logPath =
    parsed.values.log === undefined
      ? resolveActionLogPath(io.env, io.home)
      : resolve(parsed.values.log);

  const publicCommit = readPublicCommit(io.repoRoot, false);

  const result = await runLiveUse({
    logPath,
    since,
    resultsDir,
    publicCommit: publicCommit.commit,
    dirtyTree: publicCommit.dirty,
    now: io.now,
  });

  const log = result.summary.log;
  const measures = result.summary.measures;

  const skipped = Object.entries(log.skippedVersions)
    .map(([version, count]) => `version ${version} ${count}`)
    .join(', ');

  io.stdout(`Wrote ${result.runDir}\n`);

  io.stdout(
    `records: ${measures.records} (${measures.started} started, ${measures.finals} final, ${measures.incomplete} incomplete) from ${log.lines} lines; ${log.beforeSince} before --since; skipped ${skipped === '' ? 'none' : skipped}\n`,
  );

  if (log.unreadableLines > 0) {
    io.stdout(`Skipped ${log.unreadableLines} lines that are not JSON.\n`);
  }

  if (log.tornLineCharacters !== null) {
    io.stdout(`Dropped a torn last line (${log.tornLineCharacters} characters).\n`);
  }

  io.stdout(
    `tasks: ${measures.tasks}, from ${measures.firstAt ?? '-'} to ${measures.lastAt ?? '-'}\n`,
  );

  const perTask = measures.escalationsPerTask;

  io.stdout(
    `escalations per task: ${perTask.escalations}/${perTask.tasks} (mean ${perTask.mean}, standard error ${perTask.standardError ?? 'n/a'})\n`,
  );

  printCounts(io, measures.counts);

  return 0;
}

const SINCE_SCHEMA = z.union([z.iso.datetime({ offset: true }), z.iso.date()]);

function parseSince(value: string | undefined): string | null {
  if (value === undefined) {
    return null;
  }

  if (!SINCE_SCHEMA.safeParse(value).success) {
    throw new UsageError(`--since takes an ISO 8601 time with an offset, or a date, not ${value}.`);
  }

  return new Date(value).toISOString();
}

async function runAnonymiseCommand(
  args: readonly string[],
  io: Readonly<EvalCommandIO>,
): Promise<number> {
  const parsed = parseCommandArgs(args, { out: { type: 'string' } });
  const out = parsed.values.out;

  if (parsed.positionals.length === 0 || out === undefined) {
    throw new UsageError('anonymise takes one or more capture files and --out <dir>.');
  }

  const result = await writeAnonymisedCorpus({
    captureFiles: parsed.positionals.map((path) => resolve(path)),
    outDir: resolve(out),
    repoRoot: io.repoRoot,
    env: io.env,
    salt: randomBytes(32).toString('hex'),
  });

  io.stdout(
    `Wrote ${String(result.cases)} cases to ${result.outDir}. Label each case from labels.todo.json and review every case before you commit it.\n`,
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

// Runs go under the clone's root, so a directory inside the clone is refused too.
async function resolveResultsDir(option: string | null, repoRoot: string): Promise<string | null> {
  if (option === null) {
    return null;
  }

  const clone = await requireResultsClone(resolve(option), repoRoot);

  if (clone.dir !== clone.root) {
    throw new Error(`Name the root of the results clone, ${clone.root}, not ${clone.dir}.`);
  }

  return clone.dir;
}
