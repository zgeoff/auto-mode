import * as z from 'zod';

const endpointSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('login') }),
  z.strictObject({
    kind: z.literal('api-key'),
    baseURL: z.string().min(1),
    apiKey: z.string().min(1),
    maxTokens: z.number().int().positive(),
  }),
]);

export const judgeServerRequestSchema = z.strictObject({
  model: z.string().min(1),
  endpoint: endpointSchema,
  timeoutMs: z.number().int().positive(),
  system: z.string(),
  user: z.string(),
});
