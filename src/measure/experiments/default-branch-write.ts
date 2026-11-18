import { CONTAINMENT_STAGE, buildContainmentStage } from '../build-containment-stage.ts';
import { JEV_STAGE, buildJevStage } from '../build-jev-stage.ts';
import { JUDGE_STAGE, buildJudgeStage } from '../build-judge-stage.ts';
import { collectCatastrophicAllows } from '../collect-catastrophic-allows.ts';
import { collectConsentOutcomes } from '../collect-consent-outcomes.ts';
import { collectInfrastructureFailures } from '../collect-infrastructure-failures.ts';
import { defineExperiment } from '../define-experiment.ts';
import type { MeasurementCase, MeasurementCorpus } from '../load-measurement-sets.ts';
import type { RecordedStage } from '../load-recorded-cases.ts';
import { loadRecordedCases } from '../load-recorded-cases.ts';

const CORPORA: readonly MeasurementCorpus[] = [
  'default-branch-write',
  'decision-rules',
  'second-judge',
];

// Two captured Edits, which Jev denied under Default Branch Write.
const REQUIRED = [
  'default-branch-write/edit-fixture-git-calls',
  'default-branch-write/edit-fixture-git-calls-named-branch',
];

const GEO_475_RUN = 'fixtures/recorded/default-branch-write/geo-475-sonnet';

const RECORDINGS: Readonly<Record<string, readonly RecordedStage[]>> = {
  'geo-475-sonnet': CORPORA.flatMap((corpus) =>
    [JEV_STAGE, JUDGE_STAGE].map((stage) => ({
      corpus,
      stage,
      source: { kind: 'run' as const, root: 'repo' as const, path: GEO_475_RUN, stage, corpus },
    })),
  ),
};

export const defaultBranchWrite = defineExperiment<MeasurementCase>({
  name: 'default-branch-write',
  description:
    "Default Branch Write: GEO-475's captured fixture edits allowed on every sample, by key, " +
    'and every committed default-branch write held through Jev and the judge.',
  corpora: CORPORA,
  samples: 3,
  requiredCases: REQUIRED,
  recordings: [
    {
      name: 'geo-475-sonnet',
      description:
        'the GEO-475 Jev answers with the shipped judge on claude-sonnet-5-5 through the Agent SDK; with --live the judge sends again',
      liveStages: [JUDGE_STAGE],
    },
  ],
  selectCase: (label, key) =>
    REQUIRED.includes(key) ||
    (label.severity === 'catastrophic' && label.harm === 'main-or-production-write'),
  loadCases: (source) =>
    loadRecordedCases(source, { corpora: CORPORA, withHeldOut: false, recordings: RECORDINGS }),
  stages: [
    buildContainmentStage(),
    buildJevStage('shipped'),
    buildJudgeStage({ replaysRecording: true }),
  ],
  measurements: [
    (records) => collectCatastrophicAllows(records, [JUDGE_STAGE], [], [CONTAINMENT_STAGE]),
    (records) => collectConsentOutcomes(records, [JUDGE_STAGE], [CONTAINMENT_STAGE]),
    collectInfrastructureFailures,
  ],
});
