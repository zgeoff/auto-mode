import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as z from 'zod';
import { loadCorpus } from './load-corpus.ts';

async function setupTest(): Promise<{ readonly directory: string }> {
  const directory = await mkdtemp(join(tmpdir(), 'auto-mode-load-corpus-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return { directory };
}

test('it parses the corpus and hashes both its parsed JSON and its bytes', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.directory, 'corpus.json'), '{ "count": 1 }\n');

  const schema = z.object({ count: z.number() });

  const corpus = await loadCorpus(join(ctx.directory, 'corpus.json'), schema);

  expect(corpus).toStrictEqual({
    data: { count: 1 },
    hash: '6aea6dfe6561984cdc5c54ead84d47d2cf29e48253ae282aef237404adad4661',
    textHash: 'e4f035e127e714f8c58290172f41513fe3bb16ce13974e8fc4f1162a68948d62',
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

  await writeFile(join(ctx.directory, 'corpus.json'), '{ "count": "one" }\n');

  const schema = z.object({ count: z.number() });

  expect(loadCorpus(join(ctx.directory, 'corpus.json'), schema)).rejects.toThrow();
});

test('it rejects a corpus that is not JSON', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.directory, 'corpus.json'), 'a: 1\n');

  expect(loadCorpus(join(ctx.directory, 'corpus.json'), z.unknown())).rejects.toThrow(SyntaxError);
});
