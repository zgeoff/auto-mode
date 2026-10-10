import { readFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { bench, group, run } from 'mitata';

// The CLI starts once per prompted tool call, so the cold load of the scanner
// and its rule set is paid on every call; mitata only times warmed loops.
const started = performance.now();

const scanner = await import('./find-secret.ts');

console.log(`cold module load: ${(performance.now() - started).toFixed(1)} ms`);

// This repository's own source is real code full of the words the keyword
// prefilter keys on.
const corpus = await readCorpus(resolve(import.meta.dirname, '..'));

group('source', () => {
  for (const [label, size] of [
    ['100KB', 100 * 1024],
    ['1MB', 1024 * 1024],
  ] as const) {
    const text = corpus.repeat(Math.ceil(size / corpus.length)).slice(0, size);

    bench(label, () => scanner.findSecret({ text, path: 'src/example.ts' }));
  }
});

group('hostile', () => {
  for (const [id, text] of Object.entries({
    'ebay-client-id': `-prd-${'-'.repeat(20_000)}`,
    'curl-auth-user': `curl${'curl '.repeat(4000)}`,
    'curl-auth-header': `curl -H ${'curl '.repeat(4000)}`,
  })) {
    bench(id, () => scanner.findSecret({ text, path: null }));
  }
});

await run();

async function readCorpus(directory: string): Promise<string> {
  const entries = await readdir(directory, { recursive: true, withFileTypes: true });

  const files = entries
    .filter(
      (entry) =>
        entry.isFile() &&
        entry.name.endsWith('.ts') &&
        !entry.name.endsWith('.test.ts') &&
        !entry.name.endsWith('.bench.ts'),
    )
    .map((entry) => join(entry.parentPath, entry.name))
    .toSorted();

  const texts = await Promise.all(files.map((file) => readFile(file, 'utf8')));

  return texts.join('\n');
}
