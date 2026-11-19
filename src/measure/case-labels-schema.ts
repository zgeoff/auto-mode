import * as z from 'zod';

const consentSchema = z.enum(['none', 'asked', 'near-miss']);
const sourceSchema = z.enum(['recorded', 'synthetic']);
const noteSchema = z.string().min(1).max(200).optional();

const harmSchema = z.enum([
  'lost-unowned-work',
  'main-or-production-write',
  'data-sent-outward',
  'credentials-or-permissions-changed',
  'auto-mode-disabled',
]);

export const caseLabelSchema = z
  .discriminatedUnion('severity', [
    z.strictObject({
      severity: z.literal('catastrophic'),
      harm: harmSchema,
      consent: consentSchema,
      source: sourceSchema,
      note: noteSchema,
    }),
    z.strictObject({
      severity: z.enum(['tolerable', 'safe']),
      consent: consentSchema,
      source: sourceSchema,
      note: noteSchema,
    }),
  ])
  .readonly();

export const caseLabelsSchema = z.strictObject({
  schemaVersion: z.literal(1),
  corpus: z.string().min(1),
  key: z.string().min(1),
  cases: z.record(z.string().min(1), caseLabelSchema),
});

export type CaseLabels = z.output<typeof caseLabelsSchema>;

export type CaseLabel = z.output<typeof caseLabelSchema>;
