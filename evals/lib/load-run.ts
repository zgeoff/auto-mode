import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { RunSummary } from './run-summary-schema.ts';
import { runSummarySchema } from './run-summary-schema.ts';
import type { SampleRecord } from './sample-record-schema.ts';
import { sampleRecordSchema } from './sample-record-schema.ts';

export interface LoadedRun {
  readonly summary: RunSummary;
  readonly records: readonly SampleRecord[];
}

// A run interrupted before its first sample has a summary and no samples.jsonl.
export async function loadRun(runDir: string): Promise<LoadedRun> {
  const summaryText = await readFile(join(runDir, 'summary.json'), 'utf8');

  const summary = runSummarySchema.parse(JSON.parse(summaryText));

  const text = await readFile(join(runDir, 'samples.jsonl'), 'utf8').catch((error: unknown) => {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return '';
    }

    throw error;
  });

  const records = text
    .split('\n')
    .filter((line) => line !== '')
    .map((line) => sampleRecordSchema.parse(JSON.parse(line)));

  return { summary, records };
}
