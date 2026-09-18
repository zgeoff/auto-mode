import { readFile } from 'node:fs/promises';

/** One line of the conversation, flattened to text the classifier can read. */
export interface TranscriptEntry {
  readonly role: string;
  readonly text: string;
}

const MAX_ENTRY_CHARS = 2000;

/**
 * Reads the tail of a harness transcript.
 *
 * Only the tail, and always the same tail for a given session length, so the
 * prompt prefix grows by appending rather than sliding. A sliding window would
 * change the cached prefix on every call and pay full price each time.
 *
 * Every harness writes JSONL but none writes the same schema, so this reads
 * defensively and drops what it cannot understand. A transcript it cannot parse
 * yields no entries, and the classifier then judges the action with no history —
 * which is weaker, not wrong.
 */
export async function readTranscript(
  path: string | undefined,
  limit: number,
): Promise<readonly TranscriptEntry[]> {
  if (path === undefined || limit <= 0) {
    return [];
  }

  let text: string;

  try {
    text = await readFile(path, 'utf8');
  } catch {
    return [];
  }

  const entries: TranscriptEntry[] = [];

  for (const line of text.split('\n')) {
    if (line.trim() === '') {
      continue;
    }

    let parsed: unknown;

    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }

    const entry = flatten(parsed);

    if (entry !== null) {
      entries.push(entry);
    }
  }

  return entries.slice(-limit);
}

function flatten(value: unknown): TranscriptEntry | null {
  if (value === null || typeof value !== 'object') {
    return null;
  }

  const row = value as Record<string, unknown>;
  const message = row['message'];
  const inner = message !== null && typeof message === 'object' ? (message as Record<string, unknown>) : row;
  const role = typeof inner['role'] === 'string' ? inner['role'] : typeof row['type'] === 'string' ? row['type'] : null;

  if (role === null) {
    return null;
  }

  const text = contentToText(inner['content'] ?? row['content'] ?? row['text']);

  return text === '' ? null : { role, text: text.slice(0, MAX_ENTRY_CHARS) };
}

function contentToText(content: unknown): string {
  if (typeof content === 'string') {
    return content.trim();
  }

  if (!Array.isArray(content)) {
    return '';
  }

  const parts: string[] = [];

  for (const block of content) {
    if (typeof block === 'string') {
      parts.push(block);
      continue;
    }

    if (block === null || typeof block !== 'object') {
      continue;
    }

    const item = block as Record<string, unknown>;

    if (typeof item['text'] === 'string') {
      parts.push(item['text']);
      continue;
    }

    // A tool call is the most important thing in a transcript for this job, so
    // it is rendered rather than dropped.
    if (item['type'] === 'tool_use' && typeof item['name'] === 'string') {
      parts.push(`[tool ${item['name']}] ${JSON.stringify(item['input'] ?? {})}`);
    }
  }

  return parts.join('\n').trim();
}
