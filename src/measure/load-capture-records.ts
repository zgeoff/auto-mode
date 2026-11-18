import { readFile } from 'node:fs/promises';
import type { CaptureRecord } from './capture-record-schema.ts';
import { captureRecordSchema } from './capture-record-schema.ts';

export async function loadCaptureRecords(paths: readonly string[]): Promise<CaptureRecord[]> {
  const records: CaptureRecord[] = [];

  for (const path of paths) {
    const text = await readFile(path, 'utf8');

    const lines = text.split('\n');

    for (const [index, line] of lines.entries()) {
      if (line.trim() !== '') {
        records.push(parseCaptureLine(line, `${path}:${String(index + 1)}`));
      }
    }
  }

  return records;
}

function parseCaptureLine(line: string, location: string): CaptureRecord {
  let json: unknown;

  try {
    json = JSON.parse(line);
  } catch {
    throw new Error(`${location} is not JSON.`);
  }

  const parsed = captureRecordSchema.safeParse(json);

  if (!parsed.success) {
    throw new Error(`${location} is not a capture record.`);
  }

  return parsed.data;
}
