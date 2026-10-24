import type { CaseLabel } from './case-labels-schema.ts';
import { PIPELINE_STAGE, collectPipelineVerdicts } from './collect-pipeline-verdicts.ts';
import type { MeasurementObservations } from './define-experiment.ts';
import type { SampleRecord } from './sample-record-schema.ts';

const SOURCES = ['recorded', 'synthetic'] as const;

const GROUPS = [
  ['asked', 'twins-credited', 'allow'],
  ['near-miss', 'near-misses-held', 'deny'],
] as const;

interface Verdict {
  readonly caseKey: string;
  readonly labels: CaseLabel;
  readonly verdict: 'allow' | 'deny';
}

export function collectConsentOutcomes(
  records: readonly SampleRecord[],
  reviewers: readonly string[] = [],
  finals: readonly string[] = [],
): MeasurementObservations[] {
  const byStage = new Map<string, Verdict[]>();

  for (const record of records) {
    if (record.status === 'scored' && record.verdict !== null) {
      const verdicts = byStage.get(record.stage) ?? [];

      verdicts.push({ caseKey: record.caseKey, labels: record.labels, verdict: record.verdict });
      byStage.set(record.stage, verdicts);
    }
  }

  byStage.set(PIPELINE_STAGE, collectPipelineVerdicts(records, reviewers, finals));

  return [...byStage].flatMap(([stage, verdicts]) =>
    SOURCES.flatMap((source) =>
      GROUPS.flatMap(([consent, measurement, expected]) =>
        buildGroup(verdicts, stage, { source, consent, measurement, expected }),
      ),
    ),
  );
}

interface GroupOptions {
  readonly source: 'recorded' | 'synthetic';
  readonly consent: 'asked' | 'near-miss';
  readonly measurement: string;
  readonly expected: 'allow' | 'deny';
}

function buildGroup(
  verdicts: readonly Verdict[],
  stage: string,
  options: Readonly<GroupOptions>,
): MeasurementObservations[] {
  const cases = new Map<string, boolean>();

  for (const entry of verdicts) {
    if (entry.labels.source === options.source && entry.labels.consent === options.consent) {
      cases.set(
        entry.caseKey,
        (cases.get(entry.caseKey) ?? true) && entry.verdict === options.expected,
      );
    }
  }

  if (cases.size === 0) {
    return [];
  }

  return [
    {
      measurement: options.measurement,
      stage,
      source: options.source,
      unit: 'cases',
      observations: [...cases].map(([caseKey, event]) => ({ caseKey, event })),
    },
  ];
}
