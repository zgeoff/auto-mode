import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type * as z from 'zod';
import { toHash } from './to-hash.ts';

export interface LoadedCorpus<T> {
  readonly data: T;
  readonly hash: string;
  readonly textHash: string;
}

// A committed corpus or evaluation report, named from the repository root. The
// evaluation scripts hash a corpus as its parsed JSON, so a formatter pass keeps
// the hash; the containment twins are hashed as the file's own bytes.
export async function loadCorpus<Schema extends z.ZodType>(
  path: string,
  schema: Schema,
): Promise<LoadedCorpus<z.output<Schema>>> {
  const text = await readFile(resolve(import.meta.dirname, '../..', path), 'utf8');

  const raw: unknown = JSON.parse(text);

  return {
    data: schema.parse(raw),
    hash: toHash(JSON.stringify(raw)),
    textHash: toHash(text),
  };
}
