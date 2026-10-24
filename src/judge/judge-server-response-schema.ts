import * as z from 'zod';

export const judgeServerResponseSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('reply'),
    text: z.string(),
    model: z.string(),
    safetyStops: z.number().nullable(),
    fallback: z.boolean(),
    warm: z.boolean().nullable(),
  }),
  z.strictObject({
    kind: z.literal('failure'),
    aborted: z.boolean(),
    message: z.string(),
  }),
]);
