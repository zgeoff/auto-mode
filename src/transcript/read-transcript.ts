// zod's .catch() is a schema fallback, not a promise handler; both rules below match the method name alone
// oxlint-disable promise/prefer-await-to-then
// oxlint-disable unicorn/prefer-top-level-await
import { readFile } from 'node:fs/promises';
import * as z from 'zod';

export interface TranscriptEntry {
  readonly role: string;
  readonly text: string;
}

const MAX_ENTRY_CHARS = 2000;

// Each block renders to the text the classifier should read, or to '' when it
// holds nothing for this job. A tool call is the most important thing in a
// transcript here, so it is rendered rather than dropped.
const blockSchema = z.union([
  z.string(),
  z.object({ text: z.string() }).transform((block) => block.text),
  z
    .object({ type: z.literal('tool_use'), name: z.string(), input: z.unknown() })
    .transform((block) => {
      // JSON.stringify returns undefined, not a string, when handed a function
      // or a symbol, and a tool input is whatever the harness recorded.
      const input = JSON.stringify(block.input ?? {}) ?? '{}';

      return `[tool ${block.name}] ${input}`;
    }),
  z.unknown().transform(() => ''),
]);

const contentSchema = z.union([
  z.string(),
  z.array(blockSchema).transform((parts) => parts.filter((part) => part !== '').join('\n')),
  z.unknown().transform(() => ''),
]);

// Every harness writes JSONL and none writes the same schema, so a row is read
// for whichever of these shapes it happens to match.
const rowSchema = z.object({
  type: z.string().optional().catch(undefined),
  role: z.string().optional().catch(undefined),
  content: contentSchema.optional(),
  text: contentSchema.optional(),
  message: z
    .object({ role: z.string().optional().catch(undefined), content: contentSchema.optional() })
    .optional()
    .catch(undefined),
});

export async function readTranscript(
  path: string | undefined,
  limit: number,
): Promise<readonly TranscriptEntry[]> {
  if (path === undefined || limit <= 0) {
    return [];
  }

  let raw: string;

  try {
    raw = await readFile(path, 'utf8');
  } catch {
    return [];
  }

  const entries: TranscriptEntry[] = [];

  for (const line of raw.split('\n')) {
    const entry = buildEntry(line);

    if (entry !== null) {
      entries.push(entry);
    }
  }

  return entries.slice(-limit);
}

function buildEntry(line: string): TranscriptEntry | null {
  if (line.trim() === '') {
    return null;
  }

  let json: unknown;

  try {
    json = JSON.parse(line);
  } catch {
    return null;
  }

  const parsed = rowSchema.safeParse(json);

  if (!parsed.success) {
    return null;
  }

  const role = parsed.data.message?.role ?? parsed.data.role ?? parsed.data.type;

  if (role === undefined) {
    return null;
  }

  const content = parsed.data.message?.content ?? parsed.data.content ?? parsed.data.text ?? '';
  const text = content.trim();

  return text === '' ? null : { role, text: text.slice(0, MAX_ENTRY_CHARS) };
}
