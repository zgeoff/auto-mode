import { appendFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { DecisionRequestError } from 'auto-mode/eval';
import type { ClaudeRules, DecisionRequest, DecisionResult } from 'auto-mode/eval';
import { buildFallbackCounts } from './build-fallback-counts.ts';
import { buildMeasurementCounts } from './build-measurement-counts.ts';
import { buildRequiredCaseOutcomes } from './build-required-case-outcomes.ts';
import { buildStageFailureCounts } from './build-stage-failure-counts.ts';
import { buildStageLatency } from './build-stage-latency.ts';
import type { CaseLabel } from './case-labels-schema.ts';
import { PIPELINE_STAGE } from './collect-pipeline-verdicts.ts';
import type {
  CaseSet,
  Experiment,
  JudgeReply,
  JudgeRequest,
  LabelledCase,
  MeasurementObservations,
  Recording,
  StageContext,
  StageOutcome,
} from './define-experiment.ts';
import { JudgeRequestError } from './judge-request-error.ts';
import { loadCaseLabels } from './load-case-labels.ts';
import { loadCorpusHashes } from './load-corpus-hashes.ts';
import { loadRun } from './load-run.ts';
import type { ExperimentPlan } from './plan-experiment-run.ts';
import { buildStageRunKey, planExperimentRun } from './plan-experiment-run.ts';
import type { RunConfig, RunSummary } from './run-summary-schema.ts';
import type { SampleRecord } from './sample-record-schema.ts';
import { toHash } from './to-hash.ts';
import { writeReport } from './write-report.ts';

type SendRequest = (request: Readonly<DecisionRequest>) => Promise<DecisionResult>;

type SendWithChoices = (
  request: Readonly<DecisionRequest>,
  choices: readonly [string, ...string[]],
) => Promise<DecisionResult<string>>;

type SendJudge = (request: Readonly<JudgeRequest>) => Promise<JudgeReply>;

export interface RunEnvironment {
  readonly publicCommit: string;
  readonly dirtyTree: boolean;
  readonly policy: string;
  readonly judgePolicy: string;
  readonly configuredRules: ClaudeRules;

  // The model each judge request names. A claude -p reply can come from a
  // fallback model, so the reply's own model cannot stand for the stage's.
  readonly judgeModel: string | null;
  readonly send: SendRequest | null;
  readonly sendWithChoices: SendWithChoices | null;
  readonly sendJudge: SendJudge | null;
}

export interface RunOptions {
  readonly corporaDir: string;
  readonly resultsDir: string | null;
  readonly recording: string | null;
  readonly seed: number;
  readonly samples: number;
  readonly live: boolean;
  readonly maxRequests: number | null;
  readonly resumeDir: string | null;
  readonly cases: readonly string[] | null;
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
// deterministic stages and recorded answers alone runs, because it sends nothing.
export async function runExperiment<Case>(
  experiment: Readonly<Experiment<Case>>,
  options: Readonly<RunOptions>,
): Promise<RunResult> {
  const recording = requireRecording(experiment, options.recording, options.live);

  const loaded = await experiment.loadCases({
    corporaDir: options.corporaDir,
    resultsDir: options.resultsDir,
    recording: options.recording,
  });

  const selected = await loadSelectedCases(experiment, loaded.sets);

  const missingRequired = experiment.requiredCases.filter((key) => !selected.cases.has(key));

  if (missingRequired.length > 0) {
    throw new Error(
      `The ${experiment.name} cases lack the required [${missingRequired.join(', ')}].`,
    );
  }

  const caseKeys = pickCaseKeys(experiment, [...selected.cases.keys()], options.cases);

  const getLabelledCase = (caseKey: string): LabelledCase<Case> => {
    const labels = selected.labels.get(caseKey);
    const boxed = selected.cases.get(caseKey);

    if (labels === undefined || boxed === undefined) {
      throw new Error(`The run lacks the planned case ${caseKey}.`);
    }

    return { key: caseKey, labels, case: boxed.value };
  };

  const stages = pickStages(experiment, recording, options.live);
  const notMeasured = [...loaded.notMeasured, ...stages.notMeasured];

  const frozen = {
    schemaVersion: 2 as const,
    experiment: experiment.name,
    publicCommit: options.environment.publicCommit,
    dirtyTree: options.environment.dirtyTree,
    policyHash: toHash(options.environment.policy),
    judgePolicyHash: toHash(options.environment.judgePolicy),
    configuredRulesHash: toHash(JSON.stringify(options.environment.configuredRules)),
    corpusHash: toHash(
      JSON.stringify([
        ...selected.corpusHashes,
        ...loaded.inputs.toSorted((left, right) => left.path.localeCompare(right.path)),
      ]),
    ),
    labelsHash: toHash(JSON.stringify(selected.labelsHashes)),
    recording: options.recording,
    cases: options.cases === null ? null : [...options.cases].toSorted(),
    seed: options.seed,
    samples: options.samples,
    live: options.live,
  };

  const previous = options.resumeDir === null ? null : await loadRun(options.resumeDir);

  if (previous !== null) {
    requireCleanResume(previous.summary.config);
    requireSameConfig(previous.summary.config, frozen);
  }

  const records: SampleRecord[] = previous === null ? [] : [...previous.records];

  const planInput = {
    caseKeys,
    samples: options.samples,
    stages: stages.active.map((stage) => ({ name: stage.name, sends: stage.sends })),
    seed: options.seed,
    recorded: records.map((record) =>
      buildStageRunKey(record.caseKey, record.sample, record.stage),
    ),
  };

  const bounds = planExperimentRun(planInput);
  const isCounted = options.live && recording !== null;

  const plan = isCounted
    ? planExperimentRun({
        ...planInput,
        sending: await collectSendingRuns(bounds, stages.active, getLabelledCase, records, {
          ...options,
          models: previous?.summary.config.models ?? {},
        }),
      })
    : bounds;

  printPlan(plan, stages.active, notMeasured, isCounted, options.print);

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

  const models: Record<string, string> = { ...previous?.summary.config.models };

  const config: RunConfig = {
    ...frozen,
    models,
    maxRequests: options.maxRequests,
    startedAt,
    completedAt: null,
  };

  if (previous === null) {
    await mkdir(dirname(runDir), { recursive: true });
    await mkdir(runDir);
  } else {
    if (previous.tornLine !== null) {
      options.print(
        `Dropped a torn last line from samples.jsonl (${previous.tornLine.length} characters); its stage run runs again.`,
      );
    }

    // Rewritten whole, so the next append starts on a line of its own.
    await writeFile(
      join(runDir, 'samples.jsonl'),
      records.map((record) => `${JSON.stringify(record)}\n`).join(''),
    );
  }

  const buildCurrentSummary = (completedAt: string | null): RunSummary =>
    buildSummary(
      runID,
      { ...config, models: { ...models }, completedAt },
      experiment,
      records,
      notMeasured,
      stages.dropped,
    );

  // Written before the first stage runs, so an unwritable results directory fails
  // before any request and an interrupted run can be resumed.
  await writeReport(join(runDir, 'summary.json'), buildCurrentSummary(null));

  const spent = { requests: 0 };

  for (const unit of plan.units) {
    const labelled = getLabelledCase(unit.caseKey);

    for (const planned of unit.stages) {
      const stage = getActiveStage(stages.active, planned.name);

      const exchange: Exchange = {
        requestHash: null,
        answerHash: null,
        model: null,
        requestedModel: null,
        fallback: null,
      };

      const requireSend = (): void => {
        if (!options.live || !stage.sends) {
          throw new Error(`The ${stage.name} stage sent a request outside live mode.`);
        }

        if (exchange.requestHash !== null) {
          throw new Error(`The ${stage.name} stage sent a second request for one sample.`);
        }

        requireCap(spent.requests + 1, options.maxRequests);

        spent.requests += 1;
      };

      const context: StageContext = {
        seed: options.seed,
        sample: unit.sample,
        offline: !options.live,
        policy: options.environment.policy,
        configuredRules: options.environment.configuredRules,
        previous: records.filter(
          (record) => record.caseKey === unit.caseKey && record.sample === unit.sample,
        ),
        send: async (request) => {
          const send = options.environment.send;

          if (send === null) {
            throw new Error(`The ${stage.name} stage has no decision transport.`);
          }

          requireSend();

          exchange.requestHash = toHash(JSON.stringify(request));

          const result = await send(request);

          exchange.model = result.model;
          exchange.answerHash = toHash(JSON.stringify(result));

          return result;
        },
        sendWithChoices: async (request, choices) => {
          const send = options.environment.sendWithChoices;

          if (send === null) {
            throw new Error(`The ${stage.name} stage has no decision transport.`);
          }

          requireSend();

          exchange.requestHash = toHash(JSON.stringify({ request, choices }));

          const result = await send(request, choices);

          exchange.model = result.model;
          exchange.answerHash = toHash(JSON.stringify(result));

          return result;
        },
        sendJudge: async (request) => {
          const sendJudge = options.environment.sendJudge;

          if (sendJudge === null) {
            throw new Error(`The ${stage.name} stage has no judge transport.`);
          }

          requireSend();

          exchange.requestHash = toHash(JSON.stringify(request));
          exchange.requestedModel = options.environment.judgeModel;

          const reply = await sendJudge(request).catch((error: unknown) => {
            throw new JudgeRequestError(pickJudgeFailure(error), { cause: error });
          });

          exchange.model = reply.model;
          exchange.fallback = reply.fallback;
          exchange.answerHash = toHash(JSON.stringify(reply));

          return reply;
        },
      };

      const started = performance.now();

      const outcome = await tryRunStage(() => stage.run(labelled, context));

      const measuredMs = Math.round(performance.now() - started);
      const recorded = outcome.recorded;
      const responseModel = recorded?.model ?? exchange.model;
      const requestedModel = recorded?.model ?? exchange.requestedModel ?? responseModel;
      const checked = checkModel(outcome, models[stage.name] ?? null, requestedModel);

      // The first request names the stage's model; writing it at once keeps it for a
      // resume after an interruption, which would otherwise accept any model.
      if (models[stage.name] === undefined && requestedModel !== null) {
        models[stage.name] = requestedModel;

        await writeReport(join(runDir, 'summary.json'), buildCurrentSummary(null));
      }

      const latencyMs = recorded === undefined ? measuredMs : recorded.latencyMs;

      const answerHash =
        recorded === undefined ? exchange.answerHash : toHash(JSON.stringify(recorded.answer));

      const record = buildSampleRecord(labelled, unit.sample, stage.name, checked, latencyMs, {
        requestHash: exchange.requestHash,
        answerHash,
        model: responseModel,
        fallback: recorded === undefined ? exchange.fallback : null,
      });

      records.push(record);

      await appendFile(join(runDir, 'samples.jsonl'), `${JSON.stringify(record)}\n`);
    }
  }

  const summary = buildCurrentSummary(options.now().toISOString());

  await writeReport(join(runDir, 'summary.json'), summary);

  return { kind: 'completed', plan, runDir, summary };
}

interface Exchange {
  requestHash: string | null;
  answerHash: string | null;
  model: string | null;
  requestedModel: string | null;
  fallback: boolean | null;
}

function getActiveStage<Case>(
  active: readonly ActiveStage<Case>[],
  name: string,
): ActiveStage<Case> {
  const stage = active.find((entry) => entry.name === name);

  if (stage === undefined) {
    throw new Error(`The plan names a stage the experiment lacks: ${name}`);
  }

  return stage;
}

interface CheckedOutcome {
  readonly status: StageOutcome['status'];
  readonly verdict: 'allow' | 'deny' | null;
  readonly pBlock: number | null;
  readonly reason: string | null;
}

function buildSampleRecord<Case>(
  labelled: Readonly<LabelledCase<Case>>,
  sample: number,
  stage: string,
  checked: Readonly<CheckedOutcome>,
  latencyMs: number | null,
  exchange: Readonly<Pick<Exchange, 'requestHash' | 'answerHash' | 'model' | 'fallback'>>,
): SampleRecord {
  return {
    caseKey: labelled.key,
    labels: labelled.labels,
    sample,
    stage,
    status: checked.status,
    verdict: checked.status === 'scored' ? checked.verdict : null,
    pBlock: checked.status === 'scored' ? checked.pBlock : null,
    reason: checked.reason,
    latencyMs,
    requestHash: exchange.requestHash,
    answerHash: exchange.answerHash,
    model: exchange.model,
    fallback: exchange.fallback,
  };
}

class PlannedSendError extends Error {
  override name = 'PlannedSendError';
}

// A replayed answer is known before the run, so each unit runs once with sends
// that only note the attempt. After a unit's first send its later records are
// unknown, so each later stage that sends counts as sending.
async function collectSendingRuns<Case>(
  bounds: Readonly<ExperimentPlan>,
  active: readonly ActiveStage<Case>[],
  getLabelledCase: (caseKey: string) => LabelledCase<Case>,
  records: readonly SampleRecord[],
  options: Readonly<RunOptions & { readonly models: Readonly<Record<string, string>> }>,
): Promise<string[]> {
  const sending: string[] = [];
  const models: Record<string, string> = { ...options.models };

  for (const unit of bounds.units) {
    const labelled = getLabelledCase(unit.caseKey);

    const previous = records.filter(
      (record) => record.caseKey === unit.caseKey && record.sample === unit.sample,
    );

    let isUnknown = false;

    for (const planned of unit.stages) {
      const stage = getActiveStage(active, planned.name);
      const key = buildStageRunKey(unit.caseKey, unit.sample, stage.name);

      if (isUnknown) {
        if (stage.sends) {
          sending.push(key);
        }

        continue;
      }

      const probe = { sent: false };

      const sendProbe = (): Promise<never> => {
        if (!stage.sends) {
          throw new Error(`The ${stage.name} stage sent a request outside live mode.`);
        }

        probe.sent = true;
        throw new PlannedSendError();
      };

      const outcome = await tryRunStage(() =>
        stage.run(labelled, {
          seed: options.seed,
          sample: unit.sample,
          offline: !options.live,
          policy: options.environment.policy,
          configuredRules: options.environment.configuredRules,
          previous: [...previous],
          send: sendProbe,
          sendWithChoices: sendProbe,
          sendJudge: sendProbe,
        }),
      ).catch((error: unknown) => {
        if (error instanceof PlannedSendError) {
          return null;
        }

        throw error;
      });

      if (probe.sent || outcome === null) {
        sending.push(key);

        isUnknown = true;
        continue;
      }

      const responseModel = outcome.recorded?.model ?? null;
      const checked = checkModel(outcome, models[stage.name] ?? null, responseModel);

      if (models[stage.name] === undefined && responseModel !== null) {
        models[stage.name] = responseModel;
      }

      previous.push(
        buildSampleRecord(labelled, unit.sample, stage.name, checked, null, {
          requestHash: null,
          answerHash: null,
          model: responseModel,
          fallback: null,
        }),
      );
    }
  }

  return sending;
}

function requireRecording<Case>(
  experiment: Readonly<Experiment<Case>>,
  recording: string | null,
  live: boolean,
): Recording | null {
  if (recording === null) {
    return null;
  }

  const found = experiment.recordings.find((entry) => entry.name === recording);

  if (found === undefined) {
    const known = experiment.recordings.map((entry) => entry.name);

    throw new Error(
      `The ${experiment.name} experiment has no recording ${recording}. Known: ${known.length === 0 ? 'none' : known.join(', ')}.`,
    );
  }

  const liveStages = found.liveStages ?? [];

  if (live && liveStages.length === 0) {
    throw new Error('A run that replays a recording sends nothing; drop --live.');
  }

  const unsent = liveStages.filter(
    (name) => !experiment.stages.some((stage) => stage.name === name && stage.sends),
  );

  if (unsent.length > 0) {
    throw new Error(
      `The ${recording} recording names live stages the ${experiment.name} experiment does not send: ${unsent.join(', ')}.`,
    );
  }

  return found;
}

// A run limited to named cases keeps the order of the full run's keys, and a
// key the experiment lacks fails before any request.
function pickCaseKeys<Case>(
  experiment: Readonly<Experiment<Case>>,
  available: readonly string[],
  cases: readonly string[] | null,
): string[] {
  const sorted = available.toSorted();

  if (cases === null) {
    return sorted;
  }

  const unknown = cases.filter((key) => !sorted.includes(key));

  if (unknown.length > 0) {
    throw new Error(`The ${experiment.name} cases lack [${unknown.join(', ')}].`);
  }

  return sorted.filter((key) => cases.includes(key));
}

// A case is boxed, so a case type that admits undefined still reads as present.
interface SelectedCases<Case> {
  readonly cases: ReadonlyMap<string, { readonly value: Case }>;
  readonly labels: ReadonlyMap<string, CaseLabel>;
  readonly corpusHashes: readonly (readonly [string, string])[];
  readonly labelsHashes: readonly (readonly [string, string])[];
}

// Each set's labels must cover its corpus; the experiment then picks the cases
// it measures by label, and its loader must hold each one. A key is qualified by
// its corpus, so two corpora may reuse a case name.
async function loadSelectedCases<Case>(
  experiment: Readonly<Experiment<Case>>,
  sets: readonly Readonly<CaseSet<Readonly<Case>>>[],
): Promise<SelectedCases<Case>> {
  const cases = new Map<string, { readonly value: Case }>();
  const labels = new Map<string, CaseLabel>();

  const corpusHashes: (readonly [string, string])[] = [];
  const labelsHashes: (readonly [string, string])[] = [];

  for (const set of sets) {
    const [setLabels, hashes] = await Promise.all([
      loadCaseLabels(set.dir),
      loadCorpusHashes(set.dir, []),
    ]);

    corpusHashes.push([set.corpus, hashes.corpusHash]);
    labelsHashes.push([set.corpus, hashes.labelsHash]);

    const picked = Object.entries(setLabels.cases).filter(([key, label]) =>
      experiment.selectCase(label, `${set.corpus}/${key}`),
    );

    const missing = picked.filter(([key]) => !Object.hasOwn(set.cases, key)).map(([key]) => key);

    if (missing.length > 0) {
      throw new Error(
        `The ${experiment.name} loader lacks the labelled ${set.corpus} cases [${missing.join(', ')}].`,
      );
    }

    for (const [key, label] of picked) {
      const qualified = `${set.corpus}/${key}`;
      const value = set.cases[key];

      if (!Object.hasOwn(set.cases, key) || value === undefined) {
        throw new Error(`The ${experiment.name} loader lacks the case ${key}.`);
      }

      cases.set(qualified, { value });
      labels.set(qualified, label);
    }
  }

  return { cases, labels, corpusHashes, labelsHashes };
}

type ActiveStage<Case> = Experiment<Case>['stages'][number];

// A recorded run replays each stage that can, runs each stage that sends
// nothing, and names each stage that would have to send as not measured. A live
// run sends the recording's live stages instead of replaying them.
interface PickedStages<Case> {
  readonly active: readonly ActiveStage<Case>[];
  readonly dropped: readonly string[];
  readonly notMeasured: readonly string[];
}

function pickStages<Case>(
  experiment: Readonly<Experiment<Case>>,
  recording: Recording | null,
  live: boolean,
): PickedStages<Case> {
  if (recording === null) {
    return { active: experiment.stages, dropped: [], notMeasured: [] };
  }

  const active: ActiveStage<Case>[] = [];
  const dropped: string[] = [];
  const notMeasured: string[] = [];
  const liveStages = live ? (recording.liveStages ?? []) : [];

  for (const stage of experiment.stages) {
    if (liveStages.includes(stage.name)) {
      active.push(stage);
    } else if (stage.replay !== undefined) {
      active.push({ ...stage, sends: false, run: stage.replay });
    } else if (stage.sends) {
      dropped.push(stage.name);

      notMeasured.push(
        `stage ${stage.name}: the ${recording.name} recording holds no answers for it`,
      );
    } else {
      active.push(stage);
    }
  }

  return { active, dropped, notMeasured };
}

function printPlan<Case>(
  plan: Readonly<ExperimentPlan>,
  stages: readonly ActiveStage<Case>[],
  notMeasured: readonly string[],
  isCounted: boolean,
  print: (line: string) => unknown,
): void {
  print(
    `Plan: ${plan.cases} cases × ${plan.samples} samples × ${plan.stages} stages; ` +
      `${plan.stageRuns} stage runs to go, ${plan.recorded} already recorded, ` +
      `${plan.requests} model requests.`,
  );

  for (const stage of stages.filter((entry) => entry.sends)) {
    const requests = plan.units.filter((unit) =>
      unit.stages.some((planned) => planned.name === stage.name && planned.sends),
    ).length;

    const line =
      stage.reviews === undefined || isCounted
        ? `  ${stage.name}: ${requests} model requests`
        : `  ${stage.name}: at most ${requests} model requests, one for each ${stage.reviews} deny`;

    print(line);
  }

  for (const entry of notMeasured) {
    print(`Not measured: ${entry}`);
  }
}

const RESUMED_FIELDS = [
  'experiment',
  'publicCommit',
  'dirtyTree',
  'policyHash',
  'judgePolicyHash',
  'configuredRulesHash',
  'corpusHash',
  'labelsHash',
  'recording',
  'seed',
  'samples',
  'live',
] as const;

// A dirty tree has no commit that names its code, so a resume could not tell
// whether the records it adds come from the same code.
function requireCleanResume(previous: Readonly<RunConfig>): void {
  if (previous.dirtyTree) {
    throw new Error(
      'Refusing to resume a run started from a dirty tree: no commit names its code.',
    );
  }
}

function requireSameConfig(
  previous: Readonly<RunConfig>,
  current: Readonly<Pick<RunConfig, (typeof RESUMED_FIELDS)[number] | 'cases'>>,
): void {
  const changed: string[] = RESUMED_FIELDS.filter((field) => previous[field] !== current[field]);

  if (JSON.stringify(previous.cases ?? null) !== JSON.stringify(current.cases ?? null)) {
    changed.push('cases');
  }

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
  notMeasured: readonly string[],
  dropped: readonly string[],
): RunSummary {
  const pipeline =
    dropped.length === 0 ? PIPELINE_STAGE : `${PIPELINE_STAGE} without ${dropped.join(', ')}`;

  const observations: MeasurementObservations[] = [];

  for (const group of experiment.measurements.flatMap((measurement) => measurement(records))) {
    const named = group.stage === PIPELINE_STAGE ? { ...group, stage: pipeline } : group;

    observations.push(named);
  }

  return {
    runID,
    config,
    notMeasured,
    counts: buildMeasurementCounts(observations),
    notScorable: buildStageFailureCounts(records),
    latency: buildStageLatency(records),
    fallbacks: buildFallbackCounts(records, config.models),
    requiredCases: buildRequiredCaseOutcomes(experiment.requiredCases, records),
  };
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

    if (error instanceof JudgeRequestError) {
      return { status: 'not-scorable', reason: `judge-${error.reason}` };
    }

    throw error;
  }
}

function pickJudgeFailure(error: unknown): JudgeRequestError['reason'] {
  const isTimeout =
    error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError');

  return isTimeout ? 'timeout' : 'request';
}

// An answer to a request that named another model than the stage's first is not
// scored. A fallback reply to a request on the stage's model is scored, and the
// summary counts it by the model its record holds.
function checkModel(
  outcome: Readonly<StageOutcome>,
  stageModel: string | null,
  requestedModel: string | null,
): CheckedOutcome {
  if (stageModel !== null && requestedModel !== null && requestedModel !== stageModel) {
    return { status: 'not-scorable', verdict: null, pBlock: null, reason: 'model-changed' };
  }

  return outcome.status === 'scored'
    ? {
        status: outcome.status,
        verdict: outcome.verdict,
        pBlock: outcome.pBlock,
        reason: outcome.reason,
      }
    : { status: outcome.status, verdict: null, pBlock: null, reason: outcome.reason };
}
