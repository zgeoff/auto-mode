import { createHash } from 'node:crypto';
import type { ActionRequest } from '../request/types.ts';

// Fields that describe a call without changing what it does; a retry that edits
// only these is still the same action.
const DESCRIPTIVE_FIELDS: Readonly<Record<string, readonly string[]>> = {
  Bash: ['description', 'timeout', 'run_in_background'],
};

// The last direct user message is part of the key, because new consent from the
// user is new evidence that the classifier must see.
export function buildRetryKey(request: Readonly<ActionRequest>): string {
  const ignored = Object.hasOwn(DESCRIPTIVE_FIELDS, request.toolName)
    ? (DESCRIPTIVE_FIELDS[request.toolName] ?? [])
    : [];

  const input = Object.fromEntries(
    Object.entries(request.toolInput).filter(([key]) => !ignored.includes(key)),
  );

  const canonical = JSON.stringify(
    sortKeys({
      cwd: request.cwd,
      toolName: request.toolName,
      toolInput: input,
      lastDirectUserMessage: request.decisionContext?.lastDirectUserMessage?.text ?? null,
    }),
  );

  return createHash('sha256').update(canonical).digest('hex');
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sortKeys(item));
  }

  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value)
        .toSorted(([a], [b]) => (a < b ? -1 : 1))
        .map(([key, item]) => [key, sortKeys(item)]),
    );
  }

  return value;
}
