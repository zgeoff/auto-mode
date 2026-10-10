import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import * as z from 'zod';
import { loadCorpus } from './load-corpus.ts';
import { toHash } from './to-hash.ts';

export interface CorpusHashes {
  readonly corpusHash: string;
  readonly labelsHash: string;
}

// Each file is hashed as its parsed JSON, so a formatter pass keeps the hashes.
export async function loadCorpusHashes(corpusDir: string): Promise<CorpusHashes> {
  const entries = await readdir(corpusDir);

  const names = entries
    .filter((name) => name.endsWith('.json') && name !== 'labels.json')
    .toSorted();

  const [files, labels] = await Promise.all([
    Promise.all(
      names.map(async (name) => {
        const loaded = await loadCorpus(join(corpusDir, name), z.unknown());

        return [name, loaded.hash];
      }),
    ),
    loadCorpus(join(corpusDir, 'labels.json'), z.unknown()),
  ]);

  return { corpusHash: toHash(JSON.stringify(files)), labelsHash: labels.hash };
}
