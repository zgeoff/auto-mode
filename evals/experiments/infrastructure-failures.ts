import { buildJevStage } from '../lib/build-jev-stage.ts';
import { buildJudgeStage } from '../lib/build-judge-stage.ts';
import { buildSecondJudgeRecordings } from '../lib/build-second-judge-recordings.ts';
import { collectInfrastructureFailures } from '../lib/collect-infrastructure-failures.ts';
import { defineExperiment } from '../lib/define-experiment.ts';
import type { MeasurementCase, MeasurementCorpus } from '../lib/load-measurement-sets.ts';
import { loadRecordedCases } from '../lib/load-recorded-cases.ts';

const CORPORA: readonly MeasurementCorpus[] = ['second-judge', 'answer-guidance'];
const RECORDINGS = buildSecondJudgeRecordings();

export const infrastructureFailures = defineExperiment<MeasurementCase>({
  name: 'infrastructure-failures',
  description:
    'Measurement 5: invalid answers, timeouts and failed requests over the requests each ' +
    'stage sent, with the judge sent every sample. Every other experiment also reports it.',
  corpora: CORPORA,
  samples: 3,
  recordings: Object.keys(RECORDINGS).map((name) => ({
    name,
    description: `every recorded GEO-78 Jev ${name.split('-')[0] ?? ''} request and ${name.split('-').slice(1).join('-')} judge request; the judge replies are read from legacy/ in the results clone`,
  })),
  loadCases: (source) =>
    loadRecordedCases(source, { corpora: CORPORA, withHeldOut: false, recordings: RECORDINGS }),
  stages: [
    buildJevStage('shipped'),
    buildJudgeStage({ scope: 'every-sample', replaysRecording: true }),
  ],
  measurements: [collectInfrastructureFailures],
});
