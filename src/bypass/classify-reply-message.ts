import { Buffer } from 'node:buffer';
import { findSecret } from '../secrets/find-secret.ts';

export type ReplyClassification =
  | { readonly kind: 'bypass' }
  | { readonly kind: 'jev'; readonly reason: string };

// The scan reads about 18 ms per 100 KB under node, so anything larger than
// this goes to Jev unscanned rather than scanned in part.
const MAX_SCANNED_BYTES = 256 * 1024;

export function classifyReplyMessage(
  toolInput: Readonly<Record<string, unknown>>,
): ReplyClassification {
  const text = [JSON.stringify(toolInput), ...collectStrings(toolInput)].join('\n');

  if (Buffer.byteLength(text, 'utf8') > MAX_SCANNED_BYTES) {
    return { kind: 'jev', reason: 'message larger than the secret scan reads' };
  }

  const secret = findSecret({ text, path: null });

  return secret === null
    ? { kind: 'bypass' }
    : { kind: 'jev', reason: `secret scan matched ${secret.rule}` };
}

// A rule that needs a key beside its value matches the JSON text, but JSON
// escapes each line break, so a rule that spans lines, such as a private key
// block, matches only the strings themselves.
function collectStrings(value: unknown): string[] {
  if (typeof value === 'string') {
    return [value];
  }

  if (typeof value !== 'object' || value === null) {
    return [];
  }

  const strings: string[] = [];

  for (const [key, entry] of Object.entries(value)) {
    strings.push(key, ...collectStrings(entry));
  }

  return strings;
}
