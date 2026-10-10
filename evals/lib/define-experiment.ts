import type {
  ActionRequest,
  ClaudeRules,
  DecisionRequest,
  DecisionResult,
  RepositoryContext,
} from 'auto-mode';
import type { CaseLabel } from './case-labels-schema.ts';
import type { SampleRecord } from './sample-record-schema.ts';

export interface LabelledCase<Case> {
  readonly key: string;
  readonly labels: CaseLabel;
  readonly case: Case;
}

export interface JudgeRequest {
  readonly action: ActionRequest;
  readonly lastUserMessage: string | null;
  readonly repository: RepositoryContext;
}

export interface JudgeReply {
  readonly model: string;
  readonly text: string;
}

export interface StageContext {
  readonly seed: number;
  readonly sample: number;
  readonly offline: boolean;
  readonly policy: string;
  readonly configuredRules: ClaudeRules;

  // The records this run already holds for the case and sample, from the earlier stages.
  readonly previous: readonly SampleRecord[];
  readonly send: (request: Readonly<DecisionRequest>) => Promise<DecisionResult>;
  readonly sendWithChoices: (
    request: Readonly<DecisionRequest>,
    choices: readonly [string, ...string[]],
  ) => Promise<DecisionResult<string>>;
  readonly sendJudge: (request: Readonly<JudgeRequest>) => Promise<JudgeReply>;
}

// A recorded answer replaces the request a stage would send: its own bytes are
// hashed, and its latency and model are the ones the recording holds. A
// recording that kept no latency leaves it null rather than zero.
export interface RecordedAnswer {
  readonly answer: unknown;
  readonly latencyMs: number | null;
  readonly model: string;
}

export type StageOutcome =
  | {
      readonly status: 'scored';
      readonly verdict: 'allow' | 'deny';
      readonly pBlock: number | null;
      readonly reason: string | null;
      readonly recorded?: RecordedAnswer;
    }
  | {
      readonly status: 'not-scorable' | 'skipped';
      readonly reason: string;
      readonly recorded?: RecordedAnswer;
    };

// Method syntax keeps the case parameter bivariant, so one registry holds
// experiments over different case types.
type StageRun<Case> = {
  // oxlint-disable-next-line typescript/method-signature-style -- the bivariance above needs a method
  run(entry: Readonly<LabelledCase<Case>>, context: Readonly<StageContext>): Promise<StageOutcome>;
}['run'];

// A stage that sends may also replay a recording. A stage that reviews another
// sends only for that stage's denies, so its planned requests are an upper bound.
export interface Stage<Case> {
  readonly name: string;
  readonly sends: boolean;
  readonly reviews?: string;
  readonly run: StageRun<Case>;
  readonly replay?: StageRun<Case>;
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

export interface CaseSource {
  readonly corporaDir: string;
  readonly resultsDir: string | null;
  readonly recording: string | null;
}

// A set is one labelled corpus: a public corpus, or the held-out set in the results clone.
export interface CaseSet<Case> {
  readonly corpus: string;
  readonly dir: string;
  readonly cases: Readonly<Record<string, Case>>;
}

export interface RecordedInput {
  readonly path: string;
  readonly hash: string;
}

export interface LoadedCases<Case> {
  readonly sets: readonly CaseSet<Case>[];
  readonly inputs: readonly RecordedInput[];
  readonly notMeasured: readonly string[];
}

interface Recording {
  readonly name: string;
  readonly description: string;
}

export interface Experiment<Case> {
  readonly name: string;
  readonly description: string;
  readonly corpora: readonly string[];
  readonly samples: number;
  readonly recordings: readonly Recording[];
  readonly requiredCases: readonly string[];
  readonly selectCase: (label: Readonly<CaseLabel>, key: string) => boolean;
  readonly loadCases: (source: Readonly<CaseSource>) => Promise<LoadedCases<Case>>;
  readonly stages: readonly Stage<Case>[];
  readonly measurements: readonly Measurement[];
}

type ExperimentInput<Case> = Omit<Experiment<Case>, 'recordings' | 'requiredCases' | 'selectCase'> &
  Partial<Pick<Experiment<Case>, 'recordings' | 'requiredCases' | 'selectCase'>>;

export function defineExperiment<Case>(
  experiment: Readonly<ExperimentInput<Case>>,
): Readonly<Experiment<Case>> {
  return {
    recordings: [],
    requiredCases: [],
    selectCase: () => true,
    ...experiment,
  };
}
