import { appendFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { DecisionRequestError } from 'auto-mode';
import type { DecisionRequest, DecisionResult } from 'auto-mode';
import { buildMeasurementCounts } from './build-measurement-counts.ts';
import { buildStageFailureCounts } from './build-stage-failure-counts.ts';
import type { Experiment, LabelledCase, StageContext, StageOutcome } from './define-experiment.ts';
import { loadCaseLabels } from './load-case-labels.ts';
import { loadCorpusHashes } from './load-corpus-hashes.ts';
import { loadRun } from './load-run.ts';
import type { ExperimentPlan } from './plan-experiment-run.ts';
import { buildStageRunKey, planExperimentRun } from './plan-experiment-run.ts';
import type { RunConfig, RunSummary } from './run-summary-schema.ts';
import type { SampleRecord } from './sample-record-schema.ts';
import { toHash } from './to-hash.ts';
import { writeReport } from './write-report.ts';

export type SendRequest = (request: Readonly<DecisionRequest>) => Promise<DecisionResult>;

export interface RunEnvironment {
  readonly publicCommit: string;
  readonly policy: string;
  readonly configuredRules: unknown;
  readonly send: SendRequest | null;
}

export interface RunOptions {
  readonly corporaDir: string;
  readonly resultsDir: string | null;
  readonly seed: number;
  readonly samples: number;
  readonly live: boolean;
  readonly maxRequests: number | null;
  readonly resumeDir: string | null;
  readonly environment: RunEnvironment;
  readonly now: () => Date;
  readonly print: (line: string) => unknown;
}

export type RunResult =
  | { readonly kind: 'planned'; readonly plan: ExperimentPlan }
  | {
      readonly kind: 'completed';
      readonly plan: ExperimentPlan;
      readonly runDir: string;
      readonly summary: RunSummary;
    };

// Without live mode a plan that needs a model request stops at the plan; a plan of
// deterministic stages alone runs, because it sends nothing.
export async function runExperiment<Case>(
  experiment: Readonly<Experiment<Case>>,
  options: Readonly<RunOptions>,
): Promise<RunResult> {
  const corpusDir = join(options.corporaDir, experiment.corpus);

  const [labels, cases, hashes] = await Promise.all([
    loadCaseLabels(corpusDir),
    experiment.loadCases(corpusDir),
    loadCorpusHashes(corpusDir),
  ]);

  const caseKeys = Object.keys(labels.cases).toSorted();

  requireSameKeys(caseKeys, [...cases.keys()], experiment.name);

  const frozen = {
    schemaVersion: 1 as const,
    experiment: experiment.name,
    publicCommit: options.environment.publicCommit,
    policyHash: toHash(options.environment.policy),
    configuredRulesHash: toHash(JSON.stringify(options.environment.configuredRules)),
    corpusHash: hashes.corpusHash,
    labelsHash: hashes.labelsHash,
    seed: options.seed,
    samples: options.samples,
    live: options.live,
  };

  const previous = options.resumeDir === null ? null : await loadRun(options.resumeDir);

  if (previous !== null) {
    requireSameConfig(previous.summary.config, frozen);
  }

  const records: SampleRecord[] = previous === null ? [] : [...previous.records];

  const plan = planExperimentRun({
    caseKeys,
    samples: options.samples,
    stages: experiment.stages.map((stage) => ({ name: stage.name, sends: stage.sends })),
    seed: options.seed,
    recorded: records.map((record) =>
      buildStageRunKey(record.caseKey, record.sample, record.stage),
    ),
  });

  options.print(
    `Plan: ${plan.cases} cases × ${plan.samples} samples × ${plan.stages} stages; ` +
      `${plan.stageRuns} stage runs to go, ${plan.recorded} already recorded, ` +
      `${plan.requests} model requests.`,
  );

  if (!options.live && plan.requests > 0) {
    options.print('Nothing was sent. Pass --live --max-requests <n> to send these requests.');

    return { kind: 'planned', plan };
  }

  if (options.live) {
    requireCap(plan.requests, options.maxRequests);
  }

  const startedAt = previous?.summary.config.startedAt ?? options.now().toISOString();
  const runID = previous?.summary.runID ?? buildRunID(startedAt, frozen);

  const runDir =
    options.resumeDir ??
    join(requireResultsDir(options.resultsDir), 'runs', experiment.name, runID);

  let model = previous?.summary.config.model ?? null;

  const config: RunConfig = {
    ...frozen,
    model,
    maxRequests: options.maxRequests,
    startedAt,
    completedAt: null,
  };

  if (previous === null) {
    await mkdir(dirname(runDir), { recursive: true });
    await mkdir(runDir);
  }

  // Written before the first stage runs, so an unwritable results directory fails
  // before any request and an interrupted run can be resumed.
  await writeReport(join(runDir, 'summary.json'), buildSummary(runID, config, experiment, records));

  const spent = { requests: 0 };

  for (const unit of plan.units) {
    const labelled: LabelledCase<Case> = {
      key: unit.caseKey,
      labels: getLabel(labels.cases, unit.caseKey),
      case: cases.get(unit.caseKey) ?? requireCase(unit.caseKey),
    };

    for (const planned of unit.stages) {
      const stage = experiment.stages.find((entry) => entry.name === planned.name);

      if (stage === undefined) {
        throw new Error(`The plan names a stage the experiment lacks: ${planned.name}`);
      }

      let requestHash: string | null = null;
      let responseModel: string | null = null;

      const context: StageContext = {
        seed: options.seed,
        sample: unit.sample,
        offline: !options.live,
        send: async (request) => {
          const send = options.environment.send;

          if (!options.live || send === null || !stage.sends) {
            throw new Error(`The ${stage.name} stage sent a request outside live mode.`);
          }

          if (requestHash !== null) {
            throw new Error(`The ${stage.name} stage sent a second request for one sample.`);
          }

          requireCap(spent.requests + 1, options.maxRequests);

          spent.requests += 1;
          requestHash = toHash(JSON.stringify(request));

          const result = await send(request);

          responseModel = result.model;

          return result;
        },
      };

      const started = performance.now();

      const outcome = await tryRunStage(() => stage.run(labelled, context));

      const latencyMs = Math.round(performance.now() - started);
      const checked = checkModel(outcome, model, responseModel);

      model ??= responseModel;

      const record: SampleRecord = {
        caseKey: unit.caseKey,
        labels: labelled.labels,
        sample: unit.sample,
        stage: stage.name,
        status: checked.status,
        verdict: checked.status === 'scored' ? checked.verdict : null,
        pBlock: checked.status === 'scored' ? checked.pBlock : null,
        reason: checked.reason,
        latencyMs,
        requestHash,
      };

      records.push(record);

      await appendFile(join(runDir, 'samples.jsonl'), `${JSON.stringify(record)}\n`);
    }
  }

  const summary = buildSummary(
    runID,
    { ...config, model, completedAt: options.now().toISOString() },
    experiment,
    records,
  );

  await writeReport(join(runDir, 'summary.json'), summary);

  return { kind: 'completed', plan, runDir, summary };
}

function requireSameKeys(
  labelled: readonly string[],
  loaded: readonly string[],
  name: string,
): void {
  const held = new Set(loaded);

  const missing = labelled.filter((key) => !held.has(key));
  const extra = loaded.filter((key) => !labelled.includes(key));

  if (missing.length > 0 || extra.length > 0) {
    throw new Error(
      `The ${name} cases miss labelled [${missing.join(', ')}] and hold unlabelled [${extra.join(', ')}].`,
    );
  }
}

const RESUMED_FIELDS = [
  'experiment',
  'publicCommit',
  'policyHash',
  'configuredRulesHash',
  'corpusHash',
  'labelsHash',
  'seed',
  'samples',
  'live',
] as const;

function requireSameConfig(
  previous: Readonly<RunConfig>,
  current: Readonly<Pick<RunConfig, (typeof RESUMED_FIELDS)[number]>>,
): void {
  const changed = RESUMED_FIELDS.filter((field) => previous[field] !== current[field]);

  if (changed.length > 0) {
    throw new Error(`Refusing to resume: the run differs in ${changed.join(', ')}.`);
  }
}

function requireResultsDir(resultsDir: string | null): string {
  if (resultsDir === null) {
    throw new Error(
      'Name the results directory with --results or AUTO_MODE_EVALS_DIR: a clone of zgeoff/auto-mode-evals.',
    );
  }

  return resultsDir;
}

function requireCap(requests: number, maxRequests: number | null): void {
  if (maxRequests === null) {
    throw new Error('A live run needs --max-requests.');
  }

  if (requests > maxRequests) {
    throw new Error(
      `Refusing to run: the plan needs ${requests} model requests and --max-requests is ${maxRequests}.`,
    );
  }
}

function buildRunID(startedAt: string, frozen: Readonly<Record<string, unknown>>): string {
  const stamp = startedAt.replaceAll(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');

  return `${stamp}-${toHash(JSON.stringify(frozen)).slice(0, 8)}`;
}

function buildSummary<Case>(
  runID: string,
  config: Readonly<RunConfig>,
  experiment: Readonly<Experiment<Case>>,
  records: readonly SampleRecord[],
): RunSummary {
  return {
    runID,
    config,
    counts: buildMeasurementCounts(
      experiment.measurements.flatMap((measurement) => measurement(records)),
    ),
    notScorable: buildStageFailureCounts(records),
  };
}

function getLabel<Label>(labels: Readonly<Record<string, Label>>, key: string): Label {
  const label = labels[key];

  if (label === undefined) {
    throw new Error(`The labels lack the planned case ${key}.`);
  }

  return label;
}

function requireCase(key: string): never {
  throw new Error(`The cases lack the planned case ${key}.`);
}

// A decision request that fails, times out, or returns an invalid answer is an
// infrastructure failure: the sample is recorded and leaves the other denominators.
async function tryRunStage(run: () => Promise<StageOutcome>): Promise<StageOutcome> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof DecisionRequestError) {
      return { status: 'not-scorable', reason: `decision-${error.reason}` };
    }

    throw error;
  }
}

interface CheckedOutcome {
  readonly status: StageOutcome['status'];
  readonly verdict: 'allow' | 'deny' | null;
  readonly pBlock: number | null;
  readonly reason: string | null;
}

// An answer from a different model than the run's first is not scored.
function checkModel(
  outcome: Readonly<StageOutcome>,
  runModel: string | null,
  responseModel: string | null,
): CheckedOutcome {
  if (runModel !== null && responseModel !== null && responseModel !== runModel) {
    return { status: 'not-scorable', verdict: null, pBlock: null, reason: 'model-changed' };
  }

  return outcome.status === 'scored'
    ? outcome
    : { status: outcome.status, verdict: null, pBlock: null, reason: outcome.reason };
}
