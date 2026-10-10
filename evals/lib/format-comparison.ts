import { buildPairedDifference } from './build-paired-difference.ts';
import type { MeasurementObservations } from './define-experiment.ts';
import type { LoadedRun } from './load-run.ts';
import type { MeasurementCount } from './run-summary-schema.ts';

export interface ComparedRun {
  readonly run: LoadedRun;
  readonly observations: readonly MeasurementObservations[];
}

const CONFIG_FIELDS = [
  'publicCommit',
  'dirtyTree',
  'policyHash',
  'judgePolicyHash',
  'configuredRulesHash',
  'corpusHash',
  'labelsHash',
  'recording',
  'models',
  'seed',
  'samples',
  'live',
] as const;

// Each measurement shows both runs' counts with their denominators and intervals,
// then the paired per-case difference b - a over the cases both runs scored.
export function formatComparison(a: Readonly<ComparedRun>, b: Readonly<ComparedRun>): string {
  const configA = a.run.summary.config;
  const configB = b.run.summary.config;

  const changed = CONFIG_FIELDS.filter(
    (field) => formatField(configA[field]) !== formatField(configB[field]),
  );

  const lines = [
    `Experiment: ${configA.experiment}`,
    `a: ${a.run.summary.runID}`,
    `b: ${b.run.summary.runID}`,
    changed.length === 0
      ? 'Config: the same in every compared field.'
      : `Config differs in: ${changed.map((field) => `${field} (${formatField(configA[field])} → ${formatField(configB[field])})`).join(', ')}`,
  ];

  const keys = [
    ...new Set(
      [...a.run.summary.counts, ...b.run.summary.counts].map((count) => buildCountKey(count)),
    ),
  ];

  for (const key of keys) {
    const countA = a.run.summary.counts.find((count) => buildCountKey(count) === key);
    const countB = b.run.summary.counts.find((count) => buildCountKey(count) === key);
    const groupA = a.observations.find((group) => buildCountKey(group) === key);
    const groupB = b.observations.find((group) => buildCountKey(group) === key);

    const paired = buildPairedDifference(
      toClustered(groupA?.observations ?? []),
      toClustered(groupB?.observations ?? []),
    );

    lines.push(
      '',
      `${key} (${countA?.unit ?? countB?.unit ?? 'unknown'})`,
      `  a: ${formatCount(countA)}`,
      `  b: ${formatCount(countB)}`,
      `  paired b - a over ${paired.shared} shared cases: ${formatSigned(paired.meanDifference)} (SE ${formatRate(paired.standardError)})`,
    );
  }

  return `${lines.join('\n')}\n`;
}

function buildCountKey(
  count: Readonly<Pick<MeasurementCount, 'measurement' | 'stage' | 'source'>>,
): string {
  return `${count.measurement} / ${count.stage} / ${count.source}`;
}

function formatCount(count: Readonly<MeasurementCount> | undefined): string {
  if (count === undefined) {
    return 'not measured';
  }

  const parts = [
    `${count.events}/${count.total} over ${count.cases} cases`,
    `Wilson ${formatRate(count.wilson.lower)}–${formatRate(count.wilson.upper)}`,
    `exact ${formatRate(count.clopperPearson.lower)}–${formatRate(count.clopperPearson.upper)}`,
  ];

  if (count.ruleOfThree !== null) {
    parts.push(`rule of three < ${formatRate(count.ruleOfThree)}`);
  }

  if (count.clusteredStandardError !== null) {
    parts.push(`clustered SE ${formatRate(count.clusteredStandardError)}`);
  }

  if (count.effectiveTotal !== null) {
    parts.push(`effective n ${count.effectiveTotal}`);
  }

  return parts.join(', ');
}

function formatField(value: unknown): string {
  return typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value);
}

function formatRate(value: number | null): string {
  return value === null ? 'n/a' : value.toFixed(4);
}

function formatSigned(value: number | null): string {
  if (value === null) {
    return 'n/a';
  }

  return `${value >= 0 ? '+' : ''}${value.toFixed(4)}`;
}

function toClustered(
  observations: readonly { readonly caseKey: string; readonly event: boolean }[],
): { cluster: string; value: number }[] {
  return observations.map((entry) => ({ cluster: entry.caseKey, value: entry.event ? 1 : 0 }));
}
