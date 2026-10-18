import { expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { collectUnanonymisedHomeUsers } from '../lib/collect-unanonymised-home-users.ts';

// A failure names the file and the count, never the user, so a real name stays
// out of the CI log.
test('it finds no home path from a real machine in any corpus or recording', async () => {
  const corpora = resolve(import.meta.dirname, '../corpora');

  const files = await Array.fromAsync(new Bun.Glob('**/*.{json,jsonl}').scan({ cwd: corpora }));

  const found = await Promise.all(
    files.map(async (file) => {
      const text = await readFile(join(corpora, file), 'utf8');

      return { file, users: collectUnanonymisedHomeUsers(text).length };
    }),
  );

  expect(files.length).toBeGreaterThan(0);
  expect(found.filter((entry) => entry.users > 0)).toStrictEqual([]);
});
