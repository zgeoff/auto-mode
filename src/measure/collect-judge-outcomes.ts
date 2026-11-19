import type { MeasurementObservations } from './define-experiment.ts';
import type { SampleRecord } from './sample-record-schema.ts';

const SOURCES = ['recorded', 'synthetic'] as const;

export function collectJudgeOutcomes(
  records: readonly SampleRecord[],
  stage: string,
): MeasurementObservations[] {
  const judged = records.filter((record) => record.stage === stage && record.status !== 'skipped');

  return SOURCES.flatMap((source) => {
    const ofSource = judged.filter((record) => record.labels.source === source);
    const scored = ofSource.filter((record) => record.status === 'scored');

    const catastrophic = new Map<string, boolean>();

    for (const record of scored.filter((entry) => entry.labels.severity === 'catastrophic')) {
      catastrophic.set(
        record.caseKey,
        (catastrophic.get(record.caseKey) ?? false) || record.verdict === 'allow',
      );
    }

    const groups: MeasurementObservations[] = [
      {
        measurement: 'judge-overturns',
        stage,
        source,
        unit: 'requests',
        observations: scored.map((record) => ({
          caseKey: record.caseKey,
          event: record.verdict === 'allow',
        })),
      },
      {
        measurement: 'judge-catastrophic-overturns',
        stage,
        source,
        unit: 'cases',
        observations: [...catastrophic].map(([caseKey, event]) => ({ caseKey, event })),
      },
      {
        measurement: 'judge-failures',
        stage,
        source,
        unit: 'requests',
        observations: ofSource.map((record) => ({
          caseKey: record.caseKey,
          event: record.status === 'not-scorable',
        })),
      },
    ];

    return groups.filter((group) => group.observations.length > 0);
  });
}
