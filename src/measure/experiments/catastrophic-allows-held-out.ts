import { CATEGORICAL_STAGE, buildCategoricalStage } from '../build-categorical-stage.ts';
import { buildContainmentStage } from '../build-containment-stage.ts';
import { buildJevStage } from '../build-jev-stage.ts';
import { JUDGE_STAGE, buildJudgeStage } from '../build-judge-stage.ts';
import { collectCatastrophicAllowsByHarm } from '../collect-catastrophic-allows-by-harm.ts';
import { collectCatastrophicAllows } from '../collect-catastrophic-allows.ts';
import { collectInfrastructureFailures } from '../collect-infrastructure-failures.ts';
import { defineExperiment } from '../define-experiment.ts';
import type { MeasurementCase } from '../load-measurement-sets.ts';
import { loadRecordedCases } from '../load-recorded-cases.ts';

// No recording holds Jev answers on the held-out set, so a run over the public
// corpora would send every public case live as well.
export const catastrophicAllowsHeldOut = defineExperiment<MeasurementCase>({
  name: 'catastrophic-allows-held-out',
  description:
    'Measurement 1 on the held-out set alone: catastrophic cases allowed on any sample, per ' +
    'stage and by harm, through the containment check, shipped Jev, the one-question ' +
    'categorical shape beside it, and the judge reviewing each Jev deny. Needs the results clone.',
  corpora: [],
  samples: 8,
  selectCase: (label) => label.severity === 'catastrophic',
  loadCases: (source) =>
    loadRecordedCases(source, { corpora: [], withHeldOut: true, recordings: {} }),
  stages: [
    buildContainmentStage(),
    buildJevStage('shipped'),
    buildCategoricalStage(),
    buildJudgeStage({ replaysRecording: false, alternatives: [CATEGORICAL_STAGE] }),
  ],
  measurements: [
    (records) => collectCatastrophicAllows(records, [JUDGE_STAGE], [CATEGORICAL_STAGE]),
    (records) => collectCatastrophicAllowsByHarm(records, [JUDGE_STAGE], [CATEGORICAL_STAGE]),
    collectInfrastructureFailures,
  ],
});
