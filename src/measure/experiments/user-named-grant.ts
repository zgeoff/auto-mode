import { buildContainmentStage } from '../build-containment-stage.ts';
import { GRANT_STAGE, buildGrantStage } from '../build-grant-stage.ts';
import { collectCatastrophicAllows } from '../collect-catastrophic-allows.ts';
import { collectConsentOutcomes } from '../collect-consent-outcomes.ts';
import { defineExperiment } from '../define-experiment.ts';
import type { MeasurementCase, MeasurementCorpus } from '../load-measurement-sets.ts';
import type { RecordedStage } from '../load-recorded-cases.ts';
import { loadRecordedCases } from '../load-recorded-cases.ts';

const CORPORA: readonly MeasurementCorpus[] = ['second-judge', 'decision-rules', 'containment'];

// control-11 writes into a worktree the message names only as a source;
// the cleanup near-miss removes a worktree the message never names; T025 and
// T026 write into the worktree the user prepared and named by its full path.
const REQUIRED = [
  'second-judge/control-11',
  'decision-rules/worktree-cleanup:near-miss',
  'decision-rules/T025',
  'decision-rules/T026',
];

const GEO_163_RUN = 'fixtures/recorded/user-named-grant/geo-163-sonnet';

const RECORDINGS: Readonly<Record<string, readonly RecordedStage[]>> = {
  'geo-163-sonnet': CORPORA.map((corpus) => ({
    corpus,
    stage: GRANT_STAGE,
    source: {
      kind: 'run' as const,
      root: 'repo' as const,
      path: GEO_163_RUN,
      stage: GRANT_STAGE,
      corpus,
    },
  })),
};

export const userNamedGrant = defineExperiment<MeasurementCase>({
  name: 'user-named-grant',
  description:
    'The user-named grant: the judge reviewing each containment deny whose every target the ' +
    'user message names, with consent twins and near-misses and the GEO-78 catastrophic cases ' +
    'through the containment check and the grant, and control-11, the own-worktree cleanup ' +
    'near-miss and the live-042 edits by key.',
  corpora: CORPORA,
  samples: 3,
  requiredCases: REQUIRED,
  recordings: [
    {
      name: 'geo-163-sonnet',
      description:
        'the GEO-163 cases with the shipped judge on the grant stage through the Agent SDK',
    },
  ],
  selectCase: (label, key) =>
    REQUIRED.includes(key) || label.consent !== 'none' || label.severity === 'catastrophic',
  loadCases: (source) =>
    loadRecordedCases(source, { corpora: CORPORA, withHeldOut: false, recordings: RECORDINGS }),
  stages: [buildContainmentStage(), buildGrantStage()],
  measurements: [
    (records) => collectCatastrophicAllows(records, [GRANT_STAGE], [], []),
    (records) => collectConsentOutcomes(records, [GRANT_STAGE], []),
  ],
});
