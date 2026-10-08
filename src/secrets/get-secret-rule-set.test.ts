import { expect, test } from 'bun:test';
import * as z from 'zod';
import { getSecretRuleSet } from './get-secret-rule-set.ts';

const windowSchema = z.strictObject({ start: z.string().min(1), maxNewlines: z.number().int() });

const patternSchema = z.strictObject({
  source: z.string().min(1),
  flags: z.string(),
  engine: z.enum(['js', 're2']),
  window: windowSchema.optional(),
});

const fieldSchema = z.enum(['secret', 'match', 'line', 'path']);
const valuesSchema = z.array(z.string());

const termSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('entropy'), op: z.enum(['<', '<=']), value: z.number() }),
  z.strictObject({
    kind: z.literal('matches'),
    field: fieldSchema,
    patterns: z.array(patternSchema),
    negate: z.boolean(),
  }),
  z.strictObject({
    kind: z.literal('contains'),
    field: fieldSchema,
    values: valuesSchema,
    negate: z.boolean(),
  }),
]);

const ruleSchema = z.strictObject({
  id: z.string(),
  pattern: patternSchema.nullable(),
  path: patternSchema.nullable(),
  keywords: z.array(z.string()),
  secretGroup: z.number().int(),
  filter: z.array(termSchema),
  report: z.boolean(),
});

const sourceSchema = z.strictObject({
  repository: z.string(),
  version: z.string(),
  commit: z.string(),
});

const unportedSchema = z.strictObject({ rule: z.string(), part: z.string() });

const ruleSetSchema = z.strictObject({
  source: sourceSchema,
  notice: z.string(),
  prefilter: z.array(patternSchema),
  filter: z.array(termSchema),
  rules: z.array(ruleSchema),
  unported: z.array(unportedSchema),
});

test('it bundles the Betterleaks v1.9.0 rule set in the shape the scanner reads', () => {
  const ruleSet = ruleSetSchema.parse(getSecretRuleSet());

  expect([ruleSet.source.version, ruleSet.source.commit, ruleSet.rules.length]).toStrictEqual([
    'v1.9.0',
    '81aff7a638638aae3a659845d089043e1d8fe9ac',
    463,
  ]);
});

test('it keeps the MIT licence notice of the rule set it bundles', () => {
  expect(getSecretRuleSet().notice.split('\n').slice(0, 1)).toStrictEqual(['MIT License']);
});
