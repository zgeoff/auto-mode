import { createHash } from 'node:crypto';
import type { ActionRequest } from '../request/types.ts';

export function buildActionHash(request: Readonly<ActionRequest>): string {
  const canonical = JSON.stringify(
    sortKeys({ cwd: request.cwd, toolName: request.toolName, toolInput: request.toolInput }),
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
