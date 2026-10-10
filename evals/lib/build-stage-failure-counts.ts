import type { StageFailureCount } from './run-summary-schema.ts';
import type { SampleRecord } from './sample-record-schema.ts';

// Measurement 5 and the reason each failed sample left the other denominators.
export function buildStageFailureCounts(records: readonly SampleRecord[]): StageFailureCount[] {
  const stages = [...new Set(records.map((record) => record.stage))];

  return stages.map((stage) => {
    const ofStage = records.filter((record) => record.stage === stage);
    const failed = ofStage.filter((record) => record.status === 'not-scorable');
    const reasons: Record<string, number> = {};

    for (const record of failed) {
      const reason = record.reason ?? 'unknown';

      reasons[reason] = (reasons[reason] ?? 0) + 1;
    }

    return {
      stage,
      notScorable: failed.length,
      attempted: ofStage.filter((record) => record.status !== 'skipped').length,
      skipped: ofStage.filter((record) => record.status === 'skipped').length,
      reasons,
    };
  });
}
