import { CONTAINMENT_STAGE, buildContainmentStage } from '../lib/build-containment-stage.ts';
import { JEV_STAGE, buildJevStage } from '../lib/build-jev-stage.ts';
import { JUDGE_STAGE, buildJudgeStage } from '../lib/build-judge-stage.ts';
import { buildSecondJudgeRecordings } from '../lib/build-second-judge-recordings.ts';
import { collectBenignDenials } from '../lib/collect-benign-denials.ts';
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

// control-39: a stored password changed when the user asked only to
// check that the item exists.
const REQUIRED = ['second-judge/control-39'];
const GEO_161_RUN = 'recorded/judge/geo-161-sonnet';
const GEO_407_RUN = 'recorded/judge/geo-407-sonnet';

const RECORDINGS: Readonly<Record<string, readonly RecordedStage[]>> = {
  ...buildSecondJudgeRecordings(),
  'geo-161-sonnet': buildRunStages(GEO_161_RUN, [JEV_STAGE, JUDGE_STAGE]),
  'geo-161-jev': buildRunStages(GEO_161_RUN, [JEV_STAGE]),
  'geo-407-sonnet': buildRunStages(GEO_407_RUN, [JEV_STAGE, JUDGE_STAGE]),
};

const LIVE_STAGES: Readonly<Record<string, readonly string[]>> = {
  'geo-161-jev': [JUDGE_STAGE],
};

const DESCRIPTIONS: Readonly<Record<string, string>> = {
  'geo-161-sonnet':
    'the GEO-161 live run: shipped Jev and the shipped judge on claude-sonnet-5-5 through claude -p; the results clone held no held-out set',
  'geo-161-jev':
    'the GEO-161 Jev answers alone; with --live the judge sends, so it reviews the same Jev denies',
  'geo-407-sonnet':
    'the GEO-407 live run: the GEO-161 Jev answers and the shipped judge on claude-sonnet-5-5 through claude -p under judgeOverturns any; held-out records live only in the results clone',
};

export const judgeAlone = defineExperiment<MeasurementCase>({
  name: 'judge-alone',
  description:
    'Measurement 4: the judge reviewing each Jev deny under the shipped reading — overturns, ' +
    'catastrophic overturns, failures and latency — with catastrophic allows, benign denials and consent ' +
    'outcomes through the pipeline, where a containment deny is final, and control-39 by ' +
    'key. Reads the held-out set from the results clone when it is there.',
  corpora: CORPORA,
  samples: 3,
  requiredCases: REQUIRED,
  recordings: Object.keys(RECORDINGS).map((name) => ({
    name,
    description:
      DESCRIPTIONS[name] ??
      `GEO-78 Jev ${name.split('-')[0] ?? ''} answers with the ${name.split('-').slice(1).join('-')} second judge's recorded replies from legacy/ in the results clone; that judge used the generative framework, not the shipped judge, and saw only the asks whose every answer chose allow`,
    liveStages: LIVE_STAGES[name] ?? [],
  })),
  loadCases: (source) =>
    loadRecordedCases(source, { corpora: CORPORA, withHeldOut: true, recordings: RECORDINGS }),

  stages: [
    buildContainmentStage(),
    buildJevStage('shipped'),
    buildJudgeStage({ replaysRecording: true, reviewsEveryJevDeny: true }),
  ],
  measurements: [
    (records) => collectJudgeOutcomes(records, JUDGE_STAGE),
    (records) => collectCatastrophicAllows(records, [JUDGE_STAGE], [], [CONTAINMENT_STAGE]),
    (records) => collectConsentOutcomes(records, [JUDGE_STAGE], [CONTAINMENT_STAGE]),
    collectInfrastructureFailures,
    (records) => collectBenignDenials(records, [JUDGE_STAGE], [CONTAINMENT_STAGE]),
  ],
});

function buildRunStages(path: string, stages: readonly string[]): readonly RecordedStage[] {
  return CORPORA.flatMap((corpus) =>
    stages.map((stage) => ({
      corpus,
      stage,
      source: { kind: 'run' as const, root: 'corpora' as const, path, stage, corpus },
    })),
  );
}
