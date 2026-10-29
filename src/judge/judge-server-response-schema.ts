import * as z from 'zod';

const modelUsageSchema = z.record(z.string(), z.unknown());

export const judgeServerResponseSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('reply'),
    text: z.string(),
    model: z.string(),
    safetyStops: z.number().nullable(),
    fallback: z.boolean(),
    warm: z.boolean().nullable(),
    modelUsage: modelUsageSchema.nullable(),
  }),
  z.strictObject({
    kind: z.literal('failure'),
    aborted: z.boolean(),
    message: z.string(),
  }),
]);
