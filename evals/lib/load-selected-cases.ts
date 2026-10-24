import type { CaseLabel } from './case-labels-schema.ts';
import type { CaseSet, Experiment } from './define-experiment.ts';
import { loadCaseLabels } from './load-case-labels.ts';
import { loadCorpusHashes } from './load-corpus-hashes.ts';

// A case is boxed, so a case type that admits undefined still reads as present.
export interface SelectedCases<Case> {
  readonly cases: ReadonlyMap<string, { readonly value: Case }>;
  readonly labels: ReadonlyMap<string, CaseLabel>;
  readonly corpusHashes: readonly (readonly [string, string])[];
  readonly labelsHashes: readonly (readonly [string, string])[];
}

export async function loadSelectedCases<Case>(
  experiment: Readonly<Experiment<Case>>,
  sets: readonly Readonly<CaseSet<Readonly<Case>>>[],
): Promise<SelectedCases<Case>> {
  const cases = new Map<string, { readonly value: Case }>();
  const labels = new Map<string, CaseLabel>();

  const corpusHashes: (readonly [string, string])[] = [];
  const labelsHashes: (readonly [string, string])[] = [];

  for (const set of sets) {
    const [setLabels, hashes] = await Promise.all([
      loadCaseLabels(set.directory),
      loadCorpusHashes(set.directory, []),
    ]);

    corpusHashes.push([set.corpus, hashes.corpusHash]);
    labelsHashes.push([set.corpus, hashes.labelsHash]);

    const picked = Object.entries(setLabels.cases).filter(([key, label]) =>
      experiment.selectCase(label, `${set.corpus}/${key}`),
    );

    const missing = picked.filter(([key]) => !Object.hasOwn(set.cases, key)).map(([key]) => key);

    if (missing.length > 0) {
      throw new Error(
        `The ${experiment.name} loader lacks the labelled ${set.corpus} cases [${missing.join(', ')}].`,
      );
    }

    for (const [key, label] of picked) {
      const qualified = `${set.corpus}/${key}`;
      const value = set.cases[key];

      if (!Object.hasOwn(set.cases, key) || value === undefined) {
        throw new Error(`The ${experiment.name} loader lacks the case ${key}.`);
      }

      cases.set(qualified, { value });
      labels.set(qualified, label);
    }
  }

  return { cases, labels, corpusHashes, labelsHashes };
}
