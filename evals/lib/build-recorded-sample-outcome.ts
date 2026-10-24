import type { StageOutcome } from './define-experiment.ts';
import type { SampleRecord } from './sample-record-schema.ts';

export function buildRecordedSampleOutcome(
  record: Readonly<SampleRecord>,
  model: string,
): StageOutcome {
  const recorded = { answer: record, latencyMs: record.latencyMs, model };

  if (record.status === 'scored') {
    if (record.verdict === null) {
      throw new Error(`The recorded ${record.stage} sample of ${record.caseKey} holds no verdict.`);
    }

    return {
      status: 'scored',
      verdict: record.verdict,
      pBlock: record.pBlock,
      reason: record.reason,
      recorded,
    };
  }

  return { status: record.status, reason: record.reason ?? 'unknown', recorded };
}
