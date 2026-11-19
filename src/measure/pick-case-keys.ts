import type { Experiment } from './define-experiment.ts';

export function pickCaseKeys<Case>(
  experiment: Readonly<Experiment<Case>>,
  available: readonly string[],
  cases: readonly string[] | null,
): string[] {
  const sorted = available.toSorted();

  if (cases === null) {
    return sorted;
  }

  const unknown = cases.filter((key) => !sorted.includes(key));

  if (unknown.length > 0) {
    throw new Error(`The ${experiment.name} cases lack [${unknown.join(', ')}].`);
  }

  return sorted.filter((key) => cases.includes(key));
}
