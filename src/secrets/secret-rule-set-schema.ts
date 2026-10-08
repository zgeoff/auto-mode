import * as z from 'zod';

const patternSchema = z
  .strictObject({
    source: z.string().min(1),
    flags: z.string(),
    engine: z.enum(['js', 're2']),
    window: z
      .strictObject({ start: z.string().min(1), maxNewlines: z.number().int() })
      .readonly()
      .optional(),
  })
  .readonly();

const fieldSchema = z.enum(['secret', 'match', 'line', 'path']);
const valuesSchema = z.array(z.string()).readonly();

const termSchema = z.discriminatedUnion('kind', [
  z
    .strictObject({ kind: z.literal('entropy'), op: z.enum(['<', '<=']), value: z.number() })
    .readonly(),
  z
    .strictObject({
      kind: z.literal('matches'),
      field: fieldSchema,
      patterns: z.array(patternSchema).readonly(),
      negate: z.boolean(),
    })
    .readonly(),
  z
    .strictObject({
      kind: z.literal('contains'),
      field: fieldSchema,
      values: valuesSchema,
      negate: z.boolean(),
    })
    .readonly(),
]);

const ruleSchema = z
  .strictObject({
    id: z.string(),
    pattern: patternSchema.nullable(),
    path: patternSchema.nullable(),
    keywords: z.array(z.string()).readonly(),
    secretGroup: z.number().int(),
    filter: z.array(termSchema).readonly(),
    report: z.boolean(),
  })
  .readonly();

const unportedSchema = z.strictObject({ rule: z.string(), part: z.string() }).readonly();

export const secretRuleSetSchema = z
  .strictObject({
    source: z
      .strictObject({ repository: z.string(), version: z.string(), commit: z.string() })
      .readonly(),
    notice: z.string(),
    prefilter: z.array(patternSchema).readonly(),
    filter: z.array(termSchema).readonly(),
    rules: z.array(ruleSchema).readonly(),
    unported: z.array(unportedSchema).readonly(),
  })
  .readonly();
