import type { ScopeRecordRequest } from '../scope/update-session-scope.ts';
import { scopeRecordRequestSchema } from './scope-record-request-schema.ts';

export function parseScopeRecordRequest(body: unknown): ScopeRecordRequest | null {
  const parsed = scopeRecordRequestSchema.safeParse(body);

  return parsed.success ? parsed.data : null;
}
