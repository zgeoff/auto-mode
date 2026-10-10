import * as z from 'zod';

const hashSchema = z.string().regex(/^[0-9a-f]{16}$/);

// A version 3 record of the diagnostics log. The diagnostics field passes
// unchecked: no measurement reads it and no result keeps it.
export const actionLogRecordSchema = z
  .strictObject({
    schemaVersion: z.literal(3),
    time: z.iso.datetime(),
    invocationID: z.string().min(1),
    sessionHash: hashSchema,
    actionHash: hashSchema.nullable(),
    status: z.enum([
      'started',
      'allow',
      'deny',
      'defer',
      'failure',
      'skipped',
      'timeout',
      'cancelled',
    ]),
    verdict: z.enum(['allow', 'deny', 'defer']).nullable(),
    decidingStage: z
      .enum(['local', 'containment', 'bypass', 'jev', 'messages', 'retry', 'budget'])
      .nullable(),
    denials: z
      .strictObject({
        consecutive: z.number().int().nonnegative(),
        session: z.number().int().nonnegative(),
      })
      .readonly()
      .nullable(),
    escalation: z.boolean(),
    diagnostics: z.unknown(),
  })
  .readonly();

export type ActionLogRecord = z.output<typeof actionLogRecordSchema>;
