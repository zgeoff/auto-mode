import * as z from 'zod';

const hashSchema = z.string().regex(/^[0-9a-f]{16}$/u);

export const actionLogRecordSchema = z
  .strictObject({
    schemaVersion: z.union([
      z.literal(3),
      z.literal(4),
      z.literal(5),
      z.literal(6),
      z.literal(7),
      z.literal(8),
      z.literal(9),
    ]),
    time: z.iso.datetime(),
    invocationID: z.string().min(1),
    sessionHash: hashSchema,
    agentHash: hashSchema.optional(),
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
    grant: z.unknown().optional(),
    action: z.unknown().optional(),
    taskEvidence: z.unknown().optional(),
  })
  .superRefine((record, context) => {
    if (record.schemaVersion >= 5 !== (record.agentHash !== undefined)) {
      context.addIssue({
        code: 'custom',
        path: ['agentHash'],
        message:
          'A version 5 or later record holds the agent hash, and an earlier version does not.',
      });
    }

    if (record.schemaVersion >= 6 !== (record.grant !== undefined)) {
      context.addIssue({
        code: 'custom',
        path: ['grant'],
        message:
          'A version 6 or later record holds the grant field, and an earlier version does not.',
      });
    }

    if (record.schemaVersion >= 7 !== (record.action !== undefined)) {
      context.addIssue({
        code: 'custom',
        path: ['action'],
        message:
          'A version 7 or later record holds the action field, and an earlier version does not.',
      });
    }

    if (record.schemaVersion >= 9 !== (record.taskEvidence !== undefined)) {
      context.addIssue({
        code: 'custom',
        path: ['taskEvidence'],
        message:
          'A version 9 or later record holds the task evidence, and an earlier version does not.',
      });
    }
  })
  .readonly();

export type ActionLogRecord = z.output<typeof actionLogRecordSchema>;
