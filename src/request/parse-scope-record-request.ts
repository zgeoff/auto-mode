import { scopeRecordRequestSchema } from './scope-record-request-schema.ts';
import type { ScopeRecordRequest } from './types.ts';

export function parseScopeRecordRequest(body: unknown): ScopeRecordRequest | null {
  const parsed = scopeRecordRequestSchema.safeParse(body);

  return parsed.success ? parsed.data : null;
}
