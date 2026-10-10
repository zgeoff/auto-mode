import type { ActionLogRecord } from './action-log-record-schema.ts';
import { buildClusteredStandardError } from './build-clustered-standard-error.ts';
import { buildMeasurementCounts } from './build-measurement-counts.ts';
import type { MeasurementObservations } from './define-experiment.ts';
import type { MeasurementCount } from './run-summary-schema.ts';

export interface TaskOutcome {
  readonly sessionHash: string;
  readonly actions: number;
  readonly denials: number;
  readonly escalations: number;
  readonly recovered: boolean | null;
}

export interface LiveUseMeasures {
  readonly records: number;
  readonly started: number;
  readonly finals: number;
  readonly incomplete: number;
  readonly tasks: number;
  readonly firstAt: string | null;
  readonly lastAt: string | null;
  readonly escalationsPerTask: {
    readonly escalations: number;
    readonly tasks: number;
    readonly mean: number;
    readonly standardError: number | null;
  };
  readonly counts: readonly MeasurementCount[];
  readonly taskOutcomes: readonly TaskOutcome[];
}

const ALL_STAGES = 'all';

// A task is one session: the record holds the hashed session identifier and no
// agent identifier, so a subagent's actions count with the session that spawned it.
export function buildLiveUseSummary(records: readonly ActionLogRecord[]): LiveUseMeasures {
  const finals = records
    .map((record, index) => ({ record, index }))
    .filter((entry) => entry.record.status !== 'started')
    .toSorted(
      (left, right) =>
        Date.parse(left.record.time) - Date.parse(right.record.time) || left.index - right.index,
    )
    .map((entry) => entry.record);

  const finished = new Set(finals.map((record) => record.invocationID));

  const startedIDs = records.filter((record) => record.status === 'started');

  const tasks = new Map<string, ActionLogRecord[]>();

  for (const record of finals) {
    tasks.set(record.sessionHash, [...(tasks.get(record.sessionHash) ?? []), record]);
  }

  const taskOutcomes = [...tasks.entries()]
    .map(([sessionHash, actions]) => buildTaskOutcome(sessionHash, actions))
    .toSorted((left, right) => left.sessionHash.localeCompare(right.sessionHash));

  const times = records.map((record) => record.time).toSorted();

  const perTask = buildClusteredStandardError(
    taskOutcomes.map((task) => ({ cluster: task.sessionHash, value: task.escalations })),
  );

  return {
    records: records.length,
    started: startedIDs.length,
    finals: finals.length,
    incomplete: startedIDs.filter((record) => !finished.has(record.invocationID)).length,
    tasks: taskOutcomes.length,
    firstAt: times.at(0) ?? null,
    lastAt: times.at(-1) ?? null,
    escalationsPerTask: {
      escalations: taskOutcomes.reduce((sum, task) => sum + task.escalations, 0),
      tasks: taskOutcomes.length,
      mean: toRounded(perTask.mean),
      standardError: perTask.standardError === null ? null : toRounded(perTask.standardError),
    },
    counts: buildMeasurementCounts([
      {
        measurement: 'tasks with an escalation',
        stage: ALL_STAGES,
        source: 'recorded',
        unit: 'cases',
        observations: taskOutcomes.map((task) => ({
          caseKey: task.sessionHash,
          event: task.escalations > 0,
        })),
      },
      {
        measurement: 'tasks that recover after a deny',
        stage: ALL_STAGES,
        source: 'recorded',
        unit: 'cases',
        observations: taskOutcomes
          .filter((task) => task.recovered !== null)
          .map((task) => ({ caseKey: task.sessionHash, event: task.recovered === true })),
      },
      ...buildDenialGroups(finals),
    ]),
    taskOutcomes,
  };
}

// A task recovers when, after its first deny, an action is allowed before any
// action reaches the user through the denial budget.
function buildTaskOutcome(sessionHash: string, actions: readonly ActionLogRecord[]): TaskOutcome {
  const firstDeny = actions.findIndex((record) => record.verdict === 'deny');

  const next =
    firstDeny === -1
      ? undefined
      : actions
          .slice(firstDeny + 1)
          .find((record) => record.escalation || record.verdict === 'allow');

  return {
    sessionHash,
    actions: actions.length,
    denials: actions.filter((record) => record.verdict === 'deny').length,
    escalations: actions.filter((record) => record.escalation).length,
    recovered: firstDeny === -1 ? null : next !== undefined && !next.escalation,
  };
}

// Every stage shares one denominator, all actions, so the per-stage rates sum to
// the all-stages rate. Actions repeat within a task, so the task is the cluster.
function buildDenialGroups(finals: readonly ActionLogRecord[]): MeasurementObservations[] {
  const stages = [
    ...new Set(
      finals
        .filter((record) => record.verdict === 'deny')
        .map((record) => record.decidingStage ?? 'none'),
    ),
  ].toSorted();

  return [ALL_STAGES, ...stages].map((stage) => ({
    measurement: 'denials per action',
    stage,
    source: 'recorded',
    unit: 'actions',
    observations: finals.map((record) => ({
      caseKey: record.sessionHash,
      event:
        record.verdict === 'deny' &&
        (stage === ALL_STAGES || (record.decidingStage ?? 'none') === stage),
    })),
  }));
}

function toRounded(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}
