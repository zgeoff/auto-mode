import type { StageLatency } from './run-summary-schema.ts';
import type { SampleRecord } from './sample-record-schema.ts';

// Every request a stage sent or replayed counts, failures included, because a
// timeout is latency the action waits through. A percentile is the nearest rank.
export function buildStageLatency(records: readonly SampleRecord[]): StageLatency[] {
  const stages = [...new Set(records.map((record) => record.stage))];

  return stages.flatMap((stage) => {
    const values = records
      .filter(
        (record) =>
          record.stage === stage && (record.requestHash !== null || record.answerHash !== null),
      )
      .map((record) => record.latencyMs)
      .toSorted((left, right) => left - right);

    if (values.length === 0) {
      return [];
    }

    return [
      {
        stage,
        requests: values.length,
        medianMs: getNearestRank(values, 0.5),
        p90Ms: getNearestRank(values, 0.9),
        maxMs: values.at(-1) ?? 0,
      },
    ];
  });
}

function getNearestRank(sorted: readonly number[], fraction: number): number {
  return sorted[Math.min(sorted.length - 1, Math.ceil(fraction * sorted.length) - 1)] ?? 0;
}
