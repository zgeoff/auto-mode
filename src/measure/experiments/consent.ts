import { buildContainmentStage } from '../build-containment-stage.ts';
import { JEV_STAGE, buildJevStage } from '../build-jev-stage.ts';
import { JUDGE_STAGE, buildJudgeStage } from '../build-judge-stage.ts';
import { collectConsentOutcomes } from '../collect-consent-outcomes.ts';
import { collectInfrastructureFailures } from '../collect-infrastructure-failures.ts';
import { defineExperiment } from '../define-experiment.ts';
import type { MeasurementCase, MeasurementCorpus } from '../load-measurement-sets.ts';
import type { RecordedStage } from '../load-recorded-cases.ts';
import { loadRecordedCases } from '../load-recorded-cases.ts';

const CORPORA: readonly MeasurementCorpus[] = ['second-judge', 'decision-rules', 'containment'];

// The two controls that baseline Jev allowed: a write into a sibling
// worktree, and a stored password changed when asked only to check it exists.
const REQUIRED = ['second-judge/control-11', 'second-judge/control-39'];

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
      corpus: 'decision-rules',
      stage: JEV_STAGE,
      source: {
        kind: 'release',
        root: 'repo',
        path: 'fixtures/recorded/containment/replay/near-miss.json',
      },
    },
    {
      corpus: 'decision-rules',
      stage: JEV_STAGE,
      source: {
        kind: 'release',
        root: 'repo',
        path: 'fixtures/recorded/containment/replay/real-traffic.json',
      },
    },
    {
      corpus: 'containment',
      stage: JEV_STAGE,
      source: {
        kind: 'jev-report',
        root: 'results',
        path: 'legacy/containment/twins-baseline.json',
      },
    },
  ],
};

export const consent = defineExperiment<MeasurementCase>({
  name: 'consent',
  description:
    'Measurement 3: consent twins credited on every sample and near-misses held on every ' +
    'sample, per stage and through every stage. GEO-78 control-11 and control-39 must be ' +
    'in every run and are reported by key.',
  corpora: CORPORA,
  samples: 3,
  recordings: [
    {
      name: 'release-all-allow',
      description:
        'the recorded baseline Jev answers of GEO-78, GEO-104 and the GEO-97 twins under ' +
        'release-all-allow; the twins are read from legacy/ in the results clone',
    },
  ],
  requiredCases: REQUIRED,
  selectCase: (label, key) => label.consent !== 'none' || REQUIRED.includes(key),
  loadCases: (source) =>
    loadRecordedCases(source, { corpora: CORPORA, withHeldOut: false, recordings: RECORDINGS }),
  stages: [
    buildContainmentStage(),
    buildJevStage('release-all-allow'),
    buildJudgeStage({ replaysRecording: false }),
  ],
  measurements: [
    (records) => collectConsentOutcomes(records, [JUDGE_STAGE]),
    collectInfrastructureFailures,
  ],
});
