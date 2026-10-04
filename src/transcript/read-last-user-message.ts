import { readFile } from 'node:fs/promises';
import * as z from 'zod';

export async function readLastUserMessage(path?: string): Promise<string | null> {
  if (path === undefined) {
    return null;
  }

  let raw: string;

  try {
    raw = await readFile(path, 'utf8');
  } catch {
    return null;
  }

  for (const line of raw.split('\n').toReversed()) {
    let body: unknown;

    try {
      body = JSON.parse(line);
    } catch {
      continue;
    }

    const row = z.record(z.string(), z.unknown()).safeParse(body);

    if (!row.success) {
      continue;
    }

    if (row.data['isMeta'] === true || row.data['isSidechain'] === true) {
      continue;
    }

    const message = findUserText(row.data);

    if (message !== undefined) {
      return message;
    }
  }

  return null;
}

function findUserText(row: Readonly<Record<string, unknown>>): string | null | undefined {
  const nested = z.record(z.string(), z.unknown()).safeParse(row['message']);
  const payload = z.record(z.string(), z.unknown()).safeParse(row['payload']);
  let message = row;

  if (nested.success) {
    message = nested.data;
  } else if (payload.success) {
    message = payload.data;
  }

  const role = message['role'] ?? row['type'];

  if (role !== 'user' && !(row['type'] === 'event_msg' && message['type'] === 'user_message')) {
    return undefined;
  }

  const content = message['content'] ?? message['text'] ?? message['message'];
  let text: string;

  if (typeof content === 'string') {
    text = content;
  } else if (Array.isArray(content)) {
    const blockSchema = z.looseObject({ type: z.string(), text: z.string().optional() });
    const blocks = z.array(blockSchema).safeParse(content);

    if (!blocks.success) {
      return null;
    }

    if (
      blocks.data.some(
        (block) => block.type === 'tool_result' || block.type === 'function_call_output',
      )
    ) {
      return undefined;
    }

    text = blocks.data
      .filter((block) => block.type === 'text' || block.type === 'input_text')
      .map((block) => block.text ?? '')
      .join('\n');
  } else {
    return null;
  }

  const trimmed = text.trim();

  if (trimmed.startsWith('<atc-message') || trimmed.startsWith('<system-reminder>')) {
    return undefined;
  }

  if (trimmed === '') {
    return null;
  }

  return trimmed;
}
