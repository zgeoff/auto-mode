import { CATEGORICAL_STAGE, buildCategoricalStage } from '../build-categorical-stage.ts';
import { buildContainmentStage } from '../build-containment-stage.ts';
import { JEV_STAGE, buildJevStage } from '../build-jev-stage.ts';
import { JUDGE_STAGE, buildJudgeStage } from '../build-judge-stage.ts';
import { collectCatastrophicAllowsByHarm } from '../collect-catastrophic-allows-by-harm.ts';
import { collectCatastrophicAllows } from '../collect-catastrophic-allows.ts';
import { collectInfrastructureFailures } from '../collect-infrastructure-failures.ts';
import { defineExperiment } from '../define-experiment.ts';
import type { MeasurementCase, MeasurementCorpus } from '../load-measurement-sets.ts';
import type { RecordedStage } from '../load-recorded-cases.ts';
import { loadRecordedCases } from '../load-recorded-cases.ts';

const CORPORA: readonly MeasurementCorpus[] = [
  'second-judge',
  'answer-guidance',
  'question-severity',
  'decision-rules',
  'containment',
];

const RECORDINGS: Readonly<Record<string, readonly RecordedStage[]>> = {
  'release-all-allow': [
    {
      corpus: 'second-judge',
      stage: JEV_STAGE,
      source: {
        kind: 'jev-report',
        root: 'repo',
        path: 'fixtures/recorded/second-judge/jev-baseline.json',
      },
    },
    {
      corpus: 'answer-guidance',
      stage: JEV_STAGE,
      source: {
        kind: 'jev-report',
        root: 'repo',
        path: 'fixtures/recorded/second-judge/jev-baseline.json',
      },
    },
    {
      corpus: 'question-severity',
      stage: JEV_STAGE,
      source: {
        kind: 'release',
        root: 'repo',
        path: 'fixtures/recorded/containment/replay/question-severity.json',
      },
    },
    {
      corpus: 'decision-rules',
      stage: JEV_STAGE,
      source: {
        kind: 'release',
        root: 'repo',
        path: 'fixtures/recorded/containment/replay/near-miss.json',
      },
    },
  ],
};

export const catastrophicAllows = defineExperiment<MeasurementCase>({
  name: 'catastrophic-allows',
  description:
    'Measurement 1: catastrophic cases allowed on any sample, per stage and by harm, with Jev ' +
    'in the per-rule and the one-question categorical shapes side by side and the judge ' +
    'reviewing each Jev deny. Reads the held-out set from the results clone when it is there.',
  corpora: CORPORA,
  samples: 8,
  recordings: [
    {
      name: 'release-all-allow',
      description:
        'the recorded per-rule Jev answers of GEO-78 (baseline), GEO-89 and GEO-104 under ' +
        'release-all-allow; no recording holds categorical or judge answers on these denies',
    },
  ],
  selectCase: (label) => label.severity === 'catastrophic',
  loadCases: (source) =>
    loadRecordedCases(source, { corpora: CORPORA, withHeldOut: true, recordings: RECORDINGS }),
  stages: [
    buildContainmentStage(),
    buildJevStage('release-all-allow'),
    buildCategoricalStage(),
    buildJudgeStage({ replaysRecording: false, alternatives: [CATEGORICAL_STAGE] }),
  ],
  measurements: [
    (records) => collectCatastrophicAllows(records, [JUDGE_STAGE], [CATEGORICAL_STAGE]),
    (records) => collectCatastrophicAllowsByHarm(records, [JUDGE_STAGE], [CATEGORICAL_STAGE]),
    collectInfrastructureFailures,
  ],
});
