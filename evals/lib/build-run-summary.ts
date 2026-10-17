import { buildFallbackCounts } from './build-fallback-counts.ts';
import { buildMeasurementCounts } from './build-measurement-counts.ts';
import { buildRequiredCaseOutcomes } from './build-required-case-outcomes.ts';
import { buildStageFailureCounts } from './build-stage-failure-counts.ts';
import { buildStageLatency } from './build-stage-latency.ts';
import { PIPELINE_STAGE } from './collect-pipeline-verdicts.ts';
import type { Experiment, MeasurementObservations } from './define-experiment.ts';
import type { RunConfig, RunSummary } from './run-summary-schema.ts';
import type { SampleRecord } from './sample-record-schema.ts';

export function buildRunSummary<Case>(
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
