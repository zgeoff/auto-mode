import { readdir } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import * as z from 'zod';
import { loadCorpus } from './load-corpus.ts';
import { toHash } from './to-hash.ts';

export interface CorpusHashes {
  readonly corpusHash: string;
  readonly labelsHash: string;
}

// Each file is hashed as its parsed JSON, so a formatter pass keeps the hashes.
// Inputs are further files the experiment reads, named relative to the corpora
// directory, such as recorded answers.
export async function loadCorpusHashes(
  corpusDir: string,
  inputs: readonly string[],
): Promise<CorpusHashes> {
  const entries = await readdir(corpusDir);

  const names = [
    ...entries
      .filter((name) => name.endsWith('.json') && name !== 'labels.json')
      .toSorted()
      .map((name) => join(corpusDir, name)),
    ...inputs.toSorted().map((input) => join(dirname(corpusDir), input)),
  ];

  const [files, labels] = await Promise.all([
    Promise.all(
      names.map(async (name) => {
        const loaded = await loadCorpus(name, z.unknown());

        return [relative(dirname(corpusDir), name), loaded.hash];
      }),
    ),
    loadCorpus(join(corpusDir, 'labels.json'), z.unknown()),
  ]);

  return { corpusHash: toHash(JSON.stringify(files)), labelsHash: labels.hash };
}
