import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as z from 'zod';
import { loadCorpus } from './load-corpus.ts';

async function setupTest(): Promise<{ readonly dir: string }> {
  const dir = await mkdtemp(join(tmpdir(), 'auto-mode-load-corpus-'));

  onTestFinished(() => rm(dir, { recursive: true, force: true }));

  return { dir };
}

test('it parses the corpus and hashes both its parsed JSON and its bytes', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.dir, 'corpus.json'), '{ "a": 1 }\n');

  const schema = z.object({ a: z.number() });

  const corpus = await loadCorpus(join(ctx.dir, 'corpus.json'), schema);

  expect(corpus).toStrictEqual({
    data: { a: 1 },
    hash: '015abd7f5cc57a2dd94b7590f04ad8084273905ee33ec5cebeae62276a97f862',
    textHash: '13bcacc8d47bd26aff811a06be81b73c1f20e30576e437509e8690adefad6241',
  });
});

test('it reads a path relative to the repository root', async () => {
  const corpus = await loadCorpus(
    'fixtures/mod-request-write.json',
    z.object({ toolName: z.string() }),
  );

  expect(corpus.data).toStrictEqual({ toolName: 'Bash' });
});

test('it rejects a corpus that does not match the schema', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.dir, 'corpus.json'), '{ "a": "one" }\n');

  const schema = z.object({ a: z.number() });

  expect(loadCorpus(join(ctx.dir, 'corpus.json'), schema)).rejects.toThrow();
});

test('it rejects a corpus that is not JSON', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.dir, 'corpus.json'), 'a: 1\n');

  expect(loadCorpus(join(ctx.dir, 'corpus.json'), z.unknown())).rejects.toThrow(SyntaxError);
});
