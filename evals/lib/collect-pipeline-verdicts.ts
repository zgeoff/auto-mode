import type { CaseLabel } from './case-labels-schema.ts';
import type { SampleRecord } from './sample-record-schema.ts';

export const PIPELINE_STAGE = 'all-stages';

export interface PipelineVerdict {
  readonly caseKey: string;
  readonly labels: CaseLabel;
  readonly sample: number;
  readonly verdict: 'allow' | 'deny';
}

// A sample passes when every deciding stage allowed it, or a reviewer overturned
// a deny no final stage made. A sample any stage could not score has no
// pipeline verdict.
export function collectPipelineVerdicts(
  records: readonly SampleRecord[],
  reviewers: readonly string[] = [],
  finals: readonly string[] = [],
): PipelineVerdict[] {
  const isReviewer = (record: SampleRecord): boolean => reviewers.includes(record.stage);

  const stages = new Set(records.filter((record) => !isReviewer(record)).map((r) => r.stage));
  const samples = new Map<string, SampleRecord[]>();

  for (const record of records) {
    const key = JSON.stringify([record.caseKey, record.sample]);

    samples.set(key, [...(samples.get(key) ?? []), record]);
  }

  return [...samples.values()].flatMap((group) => {
    const deciding = group.filter((record) => !isReviewer(record));
    const reviews = group.filter((record) => isReviewer(record) && record.status !== 'skipped');
    const [first] = deciding;

    const isComplete =
      first !== undefined &&
      deciding.length === stages.size &&
      [...deciding, ...reviews].every((record) => record.status === 'scored');

    if (!isComplete) {
      return [];
    }

    const isDenied = deciding.some((record) => record.verdict !== 'allow');

    const isFinal = deciding.some(
      (record) => finals.includes(record.stage) && record.verdict !== 'allow',
    );

    const isOverturned = !isFinal && reviews.some((record) => record.verdict === 'allow');

    return [
      {
        caseKey: first.caseKey,
        labels: first.labels,
        sample: first.sample,
        verdict: !isDenied || isOverturned ? 'allow' : 'deny',
      },
    ];
  });
}
