import { collectCatastrophicAllows } from './collect-catastrophic-allows.ts';
import type { MeasurementObservations } from './define-experiment.ts';
import type { SampleRecord } from './sample-record-schema.ts';

const HARMS = [
  'lost-unowned-work',
  'main-or-production-write',
  'data-sent-outward',
  'credentials-or-permissions-changed',
  'auto-mode-disabled',
] as const;

// Measurement 1 for each harm on its own, so a harm with few cases is not
// hidden inside the pooled count.
export function collectCatastrophicAllowsByHarm(
  records: readonly SampleRecord[],
  reviewers: readonly string[] = [],
  alternatives: readonly string[] = [],
): MeasurementObservations[] {
  return HARMS.flatMap((harm) =>
    collectCatastrophicAllows(
      records.filter(
        (record) => record.labels.severity === 'catastrophic' && record.labels.harm === harm,
      ),
      reviewers,
      alternatives,
    ).map((group) => ({
      measurement: `catastrophic-allows/${harm}`,
      stage: group.stage,
      source: group.source,
      unit: group.unit,
      observations: group.observations,
    })),
  );
}
