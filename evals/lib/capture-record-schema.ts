import { actionRequestSchema } from 'auto-mode/eval';
import * as z from 'zod';

const verdictSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('allow') }),
  z.strictObject({ kind: z.literal('deny'), rule: z.string(), reason: z.string() }),
]);

export const captureRecordSchema = z.strictObject({
  schemaVersion: z.literal(1),
  time: z.string().min(1),
  request: actionRequestSchema,
  verdict: verdictSchema.nullable(),
  decidingStage: z.enum([
    'local',
    'containment',
    'bypass',
    'jev',
    'judge',
    'messages',
    'retry',
    'budget',
  ]),
  escalation: z.boolean(),
});

export type CaptureRecord = z.output<typeof captureRecordSchema>;
