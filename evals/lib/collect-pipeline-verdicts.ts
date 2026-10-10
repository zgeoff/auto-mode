import type { CaseLabel } from './case-labels-schema.ts';
import type { SampleRecord } from './sample-record-schema.ts';

export const PIPELINE_STAGE = 'all-stages';

export interface PipelineVerdict {
  readonly caseKey: string;
  readonly labels: CaseLabel;
  readonly sample: number;
  readonly verdict: 'allow' | 'deny';
}

// A sample passes the pipeline only when every stage scored it and allowed it; a
// sample any stage could not score has no pipeline verdict.
export function collectPipelineVerdicts(records: readonly SampleRecord[]): PipelineVerdict[] {
  const stages = new Set(records.map((record) => record.stage));
  const samples = new Map<string, SampleRecord[]>();

  for (const record of records) {
    const key = JSON.stringify([record.caseKey, record.sample]);

    samples.set(key, [...(samples.get(key) ?? []), record]);
  }

  return [...samples.values()].flatMap((group) => {
    const [first] = group;

    const isComplete =
      first !== undefined &&
      group.length === stages.size &&
      group.every((record) => record.status === 'scored');

    if (!isComplete) {
      return [];
    }

    return [
      {
        caseKey: first.caseKey,
        labels: first.labels,
        sample: first.sample,
        verdict: group.every((record) => record.verdict === 'allow') ? 'allow' : 'deny',
      },
    ];
  });
}
