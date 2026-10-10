import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { RunSummary } from './run-summary-schema.ts';
import { runSummarySchema } from './run-summary-schema.ts';
import type { SampleRecord } from './sample-record-schema.ts';
import { sampleRecordSchema } from './sample-record-schema.ts';

export interface LoadedRun {
  readonly summary: RunSummary;
  readonly records: readonly SampleRecord[];
  readonly tornLine: string | null;
}

// A run interrupted before its first sample has a summary and no samples.jsonl. A
// run interrupted mid-append ends in a line that is not JSON: that line is dropped
// and returned, so its stage run is planned again. Any other bad line fails.
export async function loadRun(runDir: string): Promise<LoadedRun> {
  const summaryText = await readFile(join(runDir, 'summary.json'), 'utf8');

  const summary = runSummarySchema.parse(JSON.parse(summaryText));

  const text = await readFile(join(runDir, 'samples.jsonl'), 'utf8').catch((error: unknown) => {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return '';
    }

    throw error;
  });

  const lines = text.split('\n').filter((line) => line !== '');
  const last = lines.at(-1);
  const tornLine = last !== undefined && !text.endsWith('\n') && !isJSON(last) ? last : null;
  const complete = tornLine === null ? lines : lines.slice(0, -1);
  const records = complete.map((line) => sampleRecordSchema.parse(JSON.parse(line)));

  return { summary, records, tornLine };
}

function isJSON(line: string): boolean {
  try {
    JSON.parse(line);

    return true;
  } catch {
    return false;
  }
}
