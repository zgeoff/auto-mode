import * as z from 'zod';

const hashSchema = z.string().regex(/^[0-9a-f]{16}$/);

// A version 3 or 4 record of the diagnostics log; version 4 adds the judge
// stage and its field. The diagnostics and judge fields pass unchecked: no
// measurement reads them and no result keeps them.
export const actionLogRecordSchema = z
  .strictObject({
    schemaVersion: z.union([z.literal(3), z.literal(4)]),
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
      .enum(['local', 'containment', 'bypass', 'jev', 'judge', 'messages', 'retry', 'budget'])
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
    judge: z.unknown().optional(),
  })
  .readonly();

export type ActionLogRecord = z.output<typeof actionLogRecordSchema>;
