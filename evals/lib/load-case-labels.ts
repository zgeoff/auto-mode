import { basename, join } from 'node:path';
import type { CaseLabels } from './case-labels-schema.ts';
import { caseLabelsSchema } from './case-labels-schema.ts';
import { loadCaseKeys } from './load-case-keys.ts';
import { loadCorpus } from './load-corpus.ts';

// Reads a corpus folder's labels.json and rejects one that does not label exactly
// the corpus's cases under the corpus's own key.
export async function loadCaseLabels(corpusDir: string): Promise<CaseLabels> {
  const [labels, corpusKeys] = await Promise.all([
    loadCorpus(join(corpusDir, 'labels.json'), caseLabelsSchema),
    loadCaseKeys(corpusDir),
  ]);

  const corpus = basename(corpusDir);

  if (labels.data.corpus !== corpus) {
    throw new Error(`The ${corpus} labels name the corpus ${labels.data.corpus}.`);
  }

  if (labels.data.key !== corpusKeys.key) {
    throw new Error(
      `The ${corpus} labels key cases by ${labels.data.key}; the corpus keys them by ${corpusKeys.key}.`,
    );
  }

  const labelled = new Set(Object.keys(labels.data.cases));
  const expected = new Set(corpusKeys.keys);

  if (expected.size !== corpusKeys.keys.length) {
    throw new Error(`The ${corpus} corpus repeats a case key, so a label cannot name one case.`);
  }

  const missing = corpusKeys.keys.filter((key) => !labelled.has(key));
  const extra = [...labelled].filter((key) => !expected.has(key));

  if (missing.length > 0 || extra.length > 0) {
    throw new Error(
      `The ${corpus} labels miss [${missing.join(', ')}] and hold unknown cases [${extra.join(', ')}].`,
    );
  }

  return labels.data;
}
