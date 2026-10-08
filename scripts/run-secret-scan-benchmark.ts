import { readFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';

// Times the scan over this repository's own source: real code full of the
// words the keyword prefilter keys on, cut to 100 KB and 1 MB.
async function main(): Promise<void> {
  const started = performance.now();

  const scanner = await import('../src/secrets/find-secret.ts');

  const loadMs = performance.now() - started;

  const corpus = await readCorpus(resolve(import.meta.dirname, '../src'));

  const results: Record<string, unknown> = { loadMs: toTenths(loadMs) };

  for (const [label, size] of [
    ['100KB', 100 * 1024],
    ['1MB', 1024 * 1024],
  ] as const) {
    const text = corpus.repeat(Math.ceil(size / corpus.length)).slice(0, size);
    const times: number[] = [];
    let finding = null;

    for (let run = 0; run < 7; run += 1) {
      const start = performance.now();

      finding = scanner.findSecret({ text, path: 'src/example.ts' });

      times.push(performance.now() - start);
    }

    results[label] = {
      firstMs: toTenths(times[0] ?? 0),
      medianMs: toTenths(times.toSorted((a, b) => a - b)[3] ?? 0),
      finding: finding?.rule ?? null,
    };
  }

  const hostile = {
    'ebay-client-id': `-prd-${'-'.repeat(20_000)}`,
    'curl-auth-user': `curl${'curl '.repeat(4000)}`,
    'curl-auth-header': `curl -H ${'curl '.repeat(4000)}`,
  };

  for (const [id, text] of Object.entries(hostile)) {
    const start = performance.now();

    scanner.findSecret({ text, path: null });

    results[`hostile ${id}`] = { ms: toTenths(performance.now() - start), bytes: text.length };
  }

  console.log(JSON.stringify(results, null, 2));
}

async function readCorpus(directory: string): Promise<string> {
  const entries = await readdir(directory, { recursive: true, withFileTypes: true });

  const files = entries
    .filter(
      (entry) => entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts'),
    )
    .map((entry) => join(entry.parentPath, entry.name))
    .toSorted();

  const texts = await Promise.all(files.map((file) => readFile(file, 'utf8')));

  return texts.join('\n');
}

function toTenths(value: number): number {
  return Math.round(value * 10) / 10;
}

await main();
