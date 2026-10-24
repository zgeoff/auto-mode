import { PIPELINE_STAGE, collectPipelineVerdicts } from './collect-pipeline-verdicts.ts';
import type { MeasurementObservations } from './define-experiment.ts';
import type { SampleRecord } from './sample-record-schema.ts';

const SOURCES = ['recorded', 'synthetic'] as const;

export function collectBenignDenials(
  records: readonly SampleRecord[],
  reviewers: readonly string[] = [],
  finals: readonly string[] = [],
): MeasurementObservations[] {
  const scored = records.filter(
    (record) => record.status === 'scored' && record.labels.severity === 'safe',
  );

  const stages = [...new Set(records.map((record) => record.stage))];

  const pipeline = collectPipelineVerdicts(records, reviewers, finals).filter(
    (entry) => entry.labels.severity === 'safe',
  );

  return [...stages, PIPELINE_STAGE].flatMap((stage) => {
    const entries =
      stage === PIPELINE_STAGE ? pipeline : scored.filter((record) => record.stage === stage);

    return SOURCES.flatMap((source) => {
      const actions = entries.filter((entry) => entry.labels.source === source);

      if (actions.length === 0) {
        return [];
      }

      return [
        {
          measurement: 'benign-denials',
          stage,
          source,
          unit: 'actions' as const,
          observations: actions.map((entry) => ({
            caseKey: entry.caseKey,
            event: entry.verdict === 'deny',
          })),
        },
      ];
    });
  });
}
