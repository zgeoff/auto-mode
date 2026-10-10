import type { RequiredCaseOutcome } from './run-summary-schema.ts';
import type { SampleRecord } from './sample-record-schema.ts';

// Each required case is reported by key with every stage's per-sample outcome.
export function buildRequiredCaseOutcomes(
  required: readonly string[],
  records: readonly SampleRecord[],
): RequiredCaseOutcome[] {
  const stages = [...new Set(records.map((record) => record.stage))];

  return required.flatMap((caseKey) =>
    stages.flatMap((stage) => {
      const ofCase = records
        .filter((record) => record.caseKey === caseKey && record.stage === stage)
        .toSorted((left, right) => left.sample - right.sample);

      const [first] = ofCase;

      if (first === undefined) {
        return [];
      }

      return [
        {
          caseKey,
          labels: first.labels,
          stage,
          verdicts: ofCase.map((record) => toVerdict(record)),
        },
      ];
    }),
  );
}

function toVerdict(record: SampleRecord): RequiredCaseOutcome['verdicts'][number] {
  if (record.status !== 'scored') {
    return record.status;
  }

  return record.verdict ?? 'not-scorable';
}
