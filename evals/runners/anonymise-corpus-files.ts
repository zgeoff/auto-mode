// Rewrites a committed corpus in place through the capture anonymiser, with the
// recorded sample reasons that quote it, so one name maps to one placeholder in both.
// Usage: bun evals/runners/anonymise-corpus-files.ts <salt> <cases.json> [samples.jsonl...]
import { readFile, writeFile } from 'node:fs/promises';
import { basename, dirname } from 'node:path';
import * as z from 'zod';
import { collectIdentifiers } from '../lib/collect-identifiers.ts';
import { makeStringRewriter } from '../lib/make-string-rewriter.ts';
import type { Rewriter } from '../lib/make-string-rewriter.ts';

async function main(): Promise<void> {
  const [salt, casesFile, ...sampleFiles] = process.argv.slice(2);

  if (salt === undefined || casesFile === undefined) {
    throw new Error('usage: anonymise-corpus-files.ts <salt> <cases.json> [samples.jsonl...]');
  }

  const corpusText = await readFile(casesFile, 'utf8');

  const corpus: unknown = JSON.parse(corpusText);

  const cwd =
    typeof corpus === 'object' &&
    corpus !== null &&
    'cwd' in corpus &&
    typeof corpus.cwd === 'string'
      ? corpus.cwd
      : '';

  const rewrite = makeStringRewriter(
    collectIdentifiers([{ cwd, request: corpus, verdict: null, decidingStage: '' }]),
    salt,
  );

  await writeFile(
    casesFile,
    `${JSON.stringify(toAnonymisedValue(corpus, null, rewrite), null, 2)}\n`,
  );

  const prefix = `${basename(dirname(casesFile))}/`;

  for (const file of sampleFiles) {
    const text = await readFile(file, 'utf8');

    const rewritten = text
      .split('\n')
      .filter((line) => line !== '')
      .map((line) => {
        const sample = sampleSchema.parse(JSON.parse(line));
        const caseKey = sample['caseKey'];
        const reason = sample['reason'];

        return typeof caseKey === 'string' &&
          caseKey.startsWith(prefix) &&
          typeof reason === 'string'
          ? JSON.stringify({ ...sample, reason: rewrite(reason) })
          : line;
      });

    await writeFile(file, `${rewritten.join('\n')}\n`);
  }
}

// A record keeps its fields in their written order, so a rewritten reason
// stays where it was.
const sampleSchema = z.record(z.string(), z.unknown());

// Fields that join a case to its labels and recordings, or name a label value,
// keep their text.
const KEPT_FIELDS = new Set(['id', 'recordedAction', 'severity', 'source', 'tool']);

function toAnonymisedValue(value: unknown, key: string | null, rewrite: Rewriter): unknown {
  if (typeof value === 'string') {
    return key !== null && KEPT_FIELDS.has(key) ? value : rewrite(value);
  }

  if (Array.isArray(value)) {
    return value.map((item: unknown) => toAnonymisedValue(item, null, rewrite));
  }

  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([field, item]) => [
        field,
        toAnonymisedValue(item, field, rewrite),
      ]),
    );
  }

  return value;
}

await main();
