import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { ActionLogRecord } from './action-log-record-schema.ts';
import { actionLogRecordSchema } from './action-log-record-schema.ts';

export interface ActionLog {
  readonly logHash: string;
  readonly lines: number;
  readonly records: readonly ActionLogRecord[];
  readonly skippedVersions: Readonly<Record<string, number>>;
  readonly beforeSince: number;
  readonly tornLineCharacters: number | null;
  readonly unreadableLines: number;
}

// An error names a record number and field paths only, so no log content
// reaches the output.
export async function loadActionLog(path: string, since: string | null): Promise<ActionLog> {
  const bytes = await readFile(path);

  const text = bytes.toString('utf8');
  const lines = text.split('\n').filter((line) => line !== '');
  const last = lines.at(-1);
  const torn = last !== undefined && !text.endsWith('\n') && parseJSON(last) === undefined;
  const complete = torn ? lines.slice(0, -1) : lines;
  const records: ActionLogRecord[] = [];
  const skippedVersions: Record<string, number> = {};
  let beforeSince = 0;
  let unreadableLines = 0;

  for (const [index, line] of complete.entries()) {
    const value = parseJSON(line);

    // A torn append merges with the next record into a line that is not JSON.
    if (value === undefined) {
      unreadableLines += 1;
      continue;
    }

    const version = getSchemaVersion(value);

    if (version !== '3' && version !== '4') {
      skippedVersions[version] = (skippedVersions[version] ?? 0) + 1;
      continue;
    }

    const parsed = actionLogRecordSchema.safeParse(value);

    if (!parsed.success) {
      const paths = parsed.error.issues
        .map((issue) => (issue.path.length === 0 ? 'an unknown field' : issue.path.join('.')))
        .join(', ');

      throw new Error(
        `Record ${index + 1} of the action log is not a valid version ${version} record: ${paths}.`,
      );
    }

    if (since !== null && Date.parse(parsed.data.time) < Date.parse(since)) {
      beforeSince += 1;
      continue;
    }

    records.push(parsed.data);
  }

  return {
    logHash: createHash('sha256').update(bytes).digest('hex'),
    lines: lines.length,
    records,
    skippedVersions,
    beforeSince,
    tornLineCharacters: torn ? (last?.length ?? 0) : null,
    unreadableLines,
  };
}

function parseJSON(line: string): unknown {
  try {
    return JSON.parse(line) as unknown;
  } catch {
    return undefined;
  }
}

function getSchemaVersion(value: unknown): string {
  if (typeof value !== 'object' || value === null || !('schemaVersion' in value)) {
    return 'none';
  }

  return Number.isSafeInteger(value.schemaVersion) ? String(value.schemaVersion) : 'other';
}
