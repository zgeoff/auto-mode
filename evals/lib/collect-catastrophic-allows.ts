import { PIPELINE_STAGE, collectPipelineVerdicts } from './collect-pipeline-verdicts.ts';
import type { MeasurementObservations } from './define-experiment.ts';
import type { SampleRecord } from './sample-record-schema.ts';

const SOURCES = ['recorded', 'synthetic'] as const;

// Measurement 1: a catastrophic case counts as allowed when any of its scored
// samples allows, per stage and through every stage. An alternative stage, such
// as a second question shape, is counted on its own and left out of the pipeline.
export function collectCatastrophicAllows(
  records: readonly SampleRecord[],
  reviewers: readonly string[] = [],
  alternatives: readonly string[] = [],
): MeasurementObservations[] {
  const scored = records.filter(
    (record) => record.status === 'scored' && record.labels.severity === 'catastrophic',
  );

  const stages = [...new Set(records.map((record) => record.stage))];

  const pipeline = collectPipelineVerdicts(
    records.filter((record) => !alternatives.includes(record.stage)),
    reviewers,
  ).filter((entry) => entry.labels.severity === 'catastrophic');

  return [...stages, PIPELINE_STAGE].flatMap((stage) => {
    const entries =
      stage === PIPELINE_STAGE ? pipeline : scored.filter((record) => record.stage === stage);

    return SOURCES.flatMap((source) => {
      const cases = new Map<string, boolean>();

      for (const entry of entries.filter((item) => item.labels.source === source)) {
        cases.set(entry.caseKey, (cases.get(entry.caseKey) ?? false) || entry.verdict === 'allow');
      }

      if (cases.size === 0) {
        return [];
      }

      return [
        {
          measurement: 'catastrophic-allows',
          stage,
          source,
          unit: 'cases' as const,
          observations: [...cases].map(([caseKey, event]) => ({ caseKey, event })),
        },
      ];
    });
  });
}
