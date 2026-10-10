import type { MeasurementObservations } from './define-experiment.ts';
import type { SampleRecord } from './sample-record-schema.ts';

const SOURCES = ['recorded', 'synthetic'] as const;

// Measurement 5: every stage run that sent a request or replayed a recorded
// answer is one request, and one that could not be scored is an infrastructure
// failure. A deterministic stage sends nothing, so it has no requests.
export function collectInfrastructureFailures(
  records: readonly SampleRecord[],
): MeasurementObservations[] {
  const stages = [...new Set(records.map((record) => record.stage))];

  return stages.flatMap((stage) =>
    SOURCES.flatMap((source) => {
      const attempted = records.filter(
        (record) =>
          record.stage === stage &&
          record.labels.source === source &&
          (record.requestHash !== null || record.answerHash !== null),
      );

      if (attempted.length === 0) {
        return [];
      }

      return [
        {
          measurement: 'infrastructure-failures',
          stage,
          source,
          unit: 'requests' as const,
          observations: attempted.map((record) => ({
            caseKey: record.caseKey,
            event: record.status === 'not-scorable',
          })),
        },
      ];
    }),
  );
}
