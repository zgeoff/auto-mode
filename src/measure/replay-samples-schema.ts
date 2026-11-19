import * as z from 'zod';

// Each sample holds its case id, its sample number, and 1 when Jev released it
// under release-all-allow.
const sampleSchema = z.tuple([z.string(), z.number().int(), z.union([z.literal(0), z.literal(1)])]);

export const replaySamplesSchema = z.object({ records: z.array(sampleSchema) });
