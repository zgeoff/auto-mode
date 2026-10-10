import * as z from 'zod';
import { caseLabelSchema } from './case-labels-schema.ts';

const intervalSchema = z.strictObject({ lower: z.number(), upper: z.number() }).readonly();

const runConfigSchema = z
  .strictObject({
    schemaVersion: z.literal(2),
    experiment: z.string().min(1),
    publicCommit: z.string().min(1),
    dirtyTree: z.boolean(),
    policyHash: z.string().min(1),
    judgePolicyHash: z.string().min(1),
    configuredRulesHash: z.string().min(1),
    corpusHash: z.string().min(1),
    labelsHash: z.string().min(1),
    recording: z.string().min(1).nullable(),
    models: z.record(z.string(), z.string()).readonly(),
    seed: z.number().int(),
    samples: z.number().int().positive(),
    maxRequests: z.number().int().nonnegative().nullable(),
    live: z.boolean(),
    startedAt: z.iso.datetime(),
    completedAt: z.iso.datetime().nullable(),
  })
  .readonly();

export type RunConfig = z.output<typeof runConfigSchema>;

const measurementCountSchema = z
  .strictObject({
    measurement: z.string().min(1),
    stage: z.string().min(1),
    source: z.enum(['recorded', 'synthetic']),
    unit: z.enum(['cases', 'actions', 'requests']),
    events: z.number().int().nonnegative(),
    total: z.number().int().nonnegative(),
    cases: z.number().int().nonnegative(),
    wilson: intervalSchema,
    clopperPearson: intervalSchema,
    ruleOfThree: z.number().nullable(),
    clusteredStandardError: z.number().nullable(),
    designEffect: z.number().nullable(),
    effectiveTotal: z.number().nullable(),
  })
  .readonly();

export type MeasurementCount = z.output<typeof measurementCountSchema>;

const stageFailureCountSchema = z
  .strictObject({
    stage: z.string().min(1),
    notScorable: z.number().int().nonnegative(),
    attempted: z.number().int().nonnegative(),
    skipped: z.number().int().nonnegative(),
    reasons: z.record(z.string(), z.number().int().positive()).readonly(),
  })
  .readonly();

export type StageFailureCount = z.output<typeof stageFailureCountSchema>;

const stageLatencySchema = z
  .strictObject({
    stage: z.string().min(1),
    requests: z.number().int().nonnegative(),
    medianMs: z.number().nonnegative(),
    p90Ms: z.number().nonnegative(),
    maxMs: z.number().nonnegative(),
  })
  .readonly();

export type StageLatency = z.output<typeof stageLatencySchema>;

const requiredCaseSchema = z
  .strictObject({
    caseKey: z.string().min(1),
    labels: caseLabelSchema,
    stage: z.string().min(1),
    verdicts: z.array(z.enum(['allow', 'deny', 'not-scorable', 'skipped'])).readonly(),
  })
  .readonly();

export type RequiredCaseOutcome = z.output<typeof requiredCaseSchema>;

export const runSummarySchema = z
  .strictObject({
    runID: z.string().min(1),
    config: runConfigSchema,
    notMeasured: z.array(z.string().min(1)).readonly(),
    counts: z.array(measurementCountSchema).readonly(),
    notScorable: z.array(stageFailureCountSchema).readonly(),
    latency: z.array(stageLatencySchema).readonly(),
    requiredCases: z.array(requiredCaseSchema).readonly(),
  })
  .readonly();

export type RunSummary = z.output<typeof runSummarySchema>;
