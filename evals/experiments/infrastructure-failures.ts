import { buildJevStage } from '../lib/build-jev-stage.ts';
import { JUDGE_STAGE, buildJudgeStage } from '../lib/build-judge-stage.ts';
import { buildSecondJudgeJevRecordings } from '../lib/build-second-judge-jev-recordings.ts';
import { buildSecondJudgeRecordings } from '../lib/build-second-judge-recordings.ts';
import { collectInfrastructureFailures } from '../lib/collect-infrastructure-failures.ts';
import { defineExperiment } from '../lib/define-experiment.ts';
import type { MeasurementCase, MeasurementCorpus } from '../lib/load-measurement-sets.ts';
import { loadRecordedCases } from '../lib/load-recorded-cases.ts';

const CORPORA: readonly MeasurementCorpus[] = ['second-judge', 'answer-guidance'];
const JUDGED = buildSecondJudgeRecordings();
const JEV_ALONE = buildSecondJudgeJevRecordings();
const RECORDINGS = { ...JUDGED, ...JEV_ALONE };

export const infrastructureFailures = defineExperiment<MeasurementCase>({
  name: 'infrastructure-failures',
  description:
    'Measurement 5: invalid answers, timeouts and failed requests over the requests each ' +
    'stage sent, with the judge sent each Jev deny, as the shipped judge is. Every other ' +
    'experiment also reports it.',
  corpora: CORPORA,
  samples: 3,
  recordings: [
    ...Object.keys(JUDGED).map((name) => ({
      name,
      description: `every recorded GEO-78 Jev ${name.split('-')[0] ?? ''} request and the ${name.split('-').slice(1).join('-')} judge request on each of its denies; the judge replies are read from legacy/ in the results clone`,
    })),
    ...Object.keys(JEV_ALONE).map((name) => ({
      name,
      description: `every recorded GEO-78 Jev ${name.split('-')[0] ?? ''} request alone; with --live the shipped judge reviews each of its denies`,
      liveStages: [JUDGE_STAGE],
    })),
  ],
  loadCases: (source) =>
    loadRecordedCases(source, { corpora: CORPORA, withHeldOut: false, recordings: RECORDINGS }),
  stages: [buildJevStage('shipped'), buildJudgeStage({ replaysRecording: true })],
  measurements: [collectInfrastructureFailures],
});
