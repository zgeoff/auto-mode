import type { RunConfig } from './run-summary-schema.ts';

const RESUMED_FIELDS = [
  'experiment',
  'publicCommit',
  'dirtyTree',
  'policyHash',
  'judgePolicyHash',
  'configuredRulesHash',
  'corpusHash',
  'labelsHash',
  'recording',
  'seed',
  'samples',
  'live',
] as const;

export function requireSameConfig(
  previous: Readonly<RunConfig>,
  current: Readonly<Pick<RunConfig, (typeof RESUMED_FIELDS)[number] | 'cases'>>,
): void {
  const changed: string[] = RESUMED_FIELDS.filter((field) => previous[field] !== current[field]);

  if (JSON.stringify(previous.cases ?? null) !== JSON.stringify(current.cases ?? null)) {
    changed.push('cases');
  }

  if (changed.length > 0) {
    throw new Error(`Refusing to resume: the run differs in ${changed.join(', ')}.`);
  }
}
