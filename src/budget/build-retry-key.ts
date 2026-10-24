import { createHash } from 'node:crypto';
import type { ActionRequest } from '../request/types.ts';

const DESCRIPTIVE_FIELDS: Readonly<Record<string, readonly string[]>> = {
  Bash: ['description', 'timeout', 'run_in_background'],
};

export function buildRetryKey(request: Readonly<ActionRequest>): string {
  const ignored = Object.hasOwn(DESCRIPTIVE_FIELDS, request.toolName)
    ? (DESCRIPTIVE_FIELDS[request.toolName] ?? [])
    : [];

  const input = Object.fromEntries(
    Object.entries(request.toolInput).filter(([key]) => !ignored.includes(key)),
  );

  const message = request.decisionContext?.lastDirectUserMessage ?? null;

  const canonical = JSON.stringify(
    sortKeys({
      cwd: request.cwd,
      toolName: request.toolName,
      toolInput: input,
      lastDirectUserMessage: message?.text ?? null,
      ...(message?.freshness === 'stale' ? { lastDirectUserMessageFreshness: 'stale' } : {}),
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
        .toSorted(([leftKey], [rightKey]) => (leftKey < rightKey ? -1 : 1))
        .map(([key, item]) => [key, sortKeys(item)]),
    );
  }

  return value;
}
