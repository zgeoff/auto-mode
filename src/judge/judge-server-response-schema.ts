import * as z from 'zod';

// The server answers each request with one line of JSON: the reply, or why
// there is none.
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
