import { buildJevStage } from '../lib/build-jev-stage.ts';
import { JUDGE_STAGE, buildJudgeStage } from '../lib/build-judge-stage.ts';
import { buildSecondJudgeRecordings } from '../lib/build-second-judge-recordings.ts';
import { collectInfrastructureFailures } from '../lib/collect-infrastructure-failures.ts';
import { collectJudgeOutcomes } from '../lib/collect-judge-outcomes.ts';
import { defineExperiment } from '../lib/define-experiment.ts';
import type { MeasurementCase, MeasurementCorpus } from '../lib/load-measurement-sets.ts';
import { loadRecordedCases } from '../lib/load-recorded-cases.ts';

const CORPORA: readonly MeasurementCorpus[] = ['second-judge', 'answer-guidance'];
const RECORDINGS = buildSecondJudgeRecordings();

export const judgeAlone = defineExperiment<MeasurementCase>({
  name: 'judge-alone',
  description:
    'Measurement 4: the judge reviewing each Jev deny under the shipped reading — overturns, ' +
    'catastrophic overturns, failures and latency.',
  corpora: CORPORA,
  samples: 3,
  recordings: Object.keys(RECORDINGS).map((name) => ({
    name,
    description: `GEO-78 Jev ${name.split('-')[0] ?? ''} answers with the ${name.split('-').slice(1).join('-')} judge's recorded replies from legacy/ in the results clone; the recorded judge saw only the asks whose every answer chose allow`,
  })),
  loadCases: (source) =>
    loadRecordedCases(source, { corpora: CORPORA, withHeldOut: false, recordings: RECORDINGS }),
  stages: [
    buildJevStage('shipped'),
    buildJudgeStage({ scope: 'jev-denies', replaysRecording: true }),
  ],
  measurements: [
    (records) => collectJudgeOutcomes(records, JUDGE_STAGE),
    collectInfrastructureFailures,
  ],
});
