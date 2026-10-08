import * as z from 'zod';

// A report written before runs were split into segments holds one run whose
// times and indices may be unknown, so each is nullable.
export const relayConsentSegmentSchema = z.object({
  runnerCommit: z.string().nullable(),
  startedAt: z.string().nullable(),
  completedAt: z.string().nullable(),
  firstIndex: z.number().int().nullable(),
  lastIndex: z.number().int().nullable(),
  stoppedEarly: z.enum(['failure', 'model-changed']).nullable(),
});
