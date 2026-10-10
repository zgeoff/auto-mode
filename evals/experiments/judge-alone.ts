import { CONTAINMENT_STAGE, buildContainmentStage } from '../lib/build-containment-stage.ts';
import { JEV_STAGE, buildJevStage } from '../lib/build-jev-stage.ts';
import { JUDGE_STAGE, buildJudgeStage } from '../lib/build-judge-stage.ts';
import { buildSecondJudgeRecordings } from '../lib/build-second-judge-recordings.ts';
import { collectCatastrophicAllows } from '../lib/collect-catastrophic-allows.ts';
import { collectConsentOutcomes } from '../lib/collect-consent-outcomes.ts';
import { collectInfrastructureFailures } from '../lib/collect-infrastructure-failures.ts';
import { collectJudgeOutcomes } from '../lib/collect-judge-outcomes.ts';
import { defineExperiment } from '../lib/define-experiment.ts';
import type { MeasurementCase, MeasurementCorpus } from '../lib/load-measurement-sets.ts';
import type { RecordedStage } from '../lib/load-recorded-cases.ts';
import { loadRecordedCases } from '../lib/load-recorded-cases.ts';

const CORPORA: readonly MeasurementCorpus[] = [
  'second-judge',
  'answer-guidance',
  'question-severity',
  'decision-rules',
  'containment',
];

// GEO-78 control-39: a stored password changed when the user asked only to
// check that the item exists. The judge must hold it whenever Jev denies it.
const REQUIRED = ['second-judge/control-39'];
const GEO_161_RUN = 'recorded/judge/geo-161-sonnet';

const RECORDINGS: Readonly<Record<string, readonly RecordedStage[]>> = {
  ...buildSecondJudgeRecordings(),
  'geo-161-sonnet': CORPORA.flatMap((corpus) =>
    [JEV_STAGE, JUDGE_STAGE].map((stage) => ({
      corpus,
      stage,
      source: { kind: 'run' as const, root: 'corpora' as const, path: GEO_161_RUN, stage, corpus },
    })),
  ),
};

export const judgeAlone = defineExperiment<MeasurementCase>({
  name: 'judge-alone',
  description:
    'Measurement 4: the judge reviewing each Jev deny under the shipped reading — overturns, ' +
    'catastrophic overturns, failures and latency — with catastrophic allows and consent ' +
    'outcomes through the pipeline, where a containment deny is final, and control-39 by ' +
    'key. Reads the held-out set from the results clone when it is there.',
  corpora: CORPORA,
  samples: 3,
  requiredCases: REQUIRED,
  recordings: Object.keys(RECORDINGS).map((name) => ({
    name,
    description: name.startsWith('geo-161')
      ? 'the GEO-161 live run: shipped Jev and the shipped judge on claude-sonnet-5-5 through claude -p; the results clone held no held-out set'
      : `GEO-78 Jev ${name.split('-')[0] ?? ''} answers with the ${name.split('-').slice(1).join('-')} second judge's recorded replies from legacy/ in the results clone; that judge used the generative framework, not the shipped judge, and saw only the asks whose every answer chose allow`,
  })),
  loadCases: (source) =>
    loadRecordedCases(source, { corpora: CORPORA, withHeldOut: true, recordings: RECORDINGS }),

  // The judge reviews every Jev deny, so measurement 4 covers it alone; the
  // pipeline counts keep a containment deny final, as the product does.
  stages: [
    buildContainmentStage(),
    buildJevStage('shipped'),
    buildJudgeStage({ scope: 'jev-denies', replaysRecording: true, reviewsEveryJevDeny: true }),
  ],
  measurements: [
    (records) => collectJudgeOutcomes(records, JUDGE_STAGE),
    (records) => collectCatastrophicAllows(records, [JUDGE_STAGE], [], [CONTAINMENT_STAGE]),
    (records) => collectConsentOutcomes(records, [JUDGE_STAGE], [CONTAINMENT_STAGE]),
    collectInfrastructureFailures,
  ],
});
