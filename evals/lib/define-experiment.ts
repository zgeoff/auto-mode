import type { DecisionRequest, DecisionResult } from 'auto-mode';
import type { CaseLabel } from './case-labels-schema.ts';
import type { SampleRecord } from './sample-record-schema.ts';

export interface LabelledCase<Case> {
  readonly key: string;
  readonly labels: CaseLabel;
  readonly case: Case;
}

export interface StageContext {
  readonly seed: number;
  readonly sample: number;
  readonly offline: boolean;
  readonly send: (request: Readonly<DecisionRequest>) => Promise<DecisionResult>;
}

export type StageOutcome =
  | {
      readonly status: 'scored';
      readonly verdict: 'allow' | 'deny';
      readonly pBlock: number | null;
      readonly reason: string | null;
    }
  | { readonly status: 'not-scorable' | 'skipped'; readonly reason: string };

// Method syntax keeps the case parameter bivariant, so one registry holds
// experiments over different case types.
type StageRun<Case> = {
  // oxlint-disable-next-line typescript/method-signature-style -- the bivariance above needs a method
  run(entry: Readonly<LabelledCase<Case>>, context: Readonly<StageContext>): Promise<StageOutcome>;
}['run'];

interface Stage<Case> {
  readonly name: string;
  readonly sends: boolean;
  readonly run: StageRun<Case>;
}

interface Observation {
  readonly caseKey: string;
  readonly event: boolean;
}

export interface MeasurementObservations {
  readonly measurement: string;
  readonly stage: string;
  readonly source: 'recorded' | 'synthetic';
  readonly unit: 'cases' | 'actions' | 'requests';
  readonly observations: readonly Observation[];
}

type Measurement = (records: readonly SampleRecord[]) => MeasurementObservations[];

export interface Experiment<Case> {
  readonly name: string;
  readonly description: string;
  readonly corpus: string;
  readonly samples: number;
  readonly loadCases: (corpusDir: string) => Promise<ReadonlyMap<string, Case>>;
  readonly stages: readonly Stage<Case>[];
  readonly measurements: readonly Measurement[];
}

export function defineExperiment<Case>(
  experiment: Readonly<Experiment<Case>>,
): Readonly<Experiment<Case>> {
  return experiment;
}
