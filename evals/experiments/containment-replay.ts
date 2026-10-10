import { dirname, join } from 'node:path';
import { checkCwdContainment } from '../lib/check-cwd-containment.ts';
import { collectBenignDenials } from '../lib/collect-benign-denials.ts';
import { collectCatastrophicAllows } from '../lib/collect-catastrophic-allows.ts';
import { replaySamplesSchema } from '../lib/corpora/replay-samples-schema.ts';
import { defineExperiment } from '../lib/define-experiment.ts';
import type { StageOutcome } from '../lib/define-experiment.ts';
import { loadCorpus } from '../lib/load-corpus.ts';
import type { DecisionRulesCase } from '../lib/load-decision-rules-cases.ts';
import { loadDecisionRulesCases } from '../lib/load-decision-rules-cases.ts';

interface ReplayCase {
  readonly call: DecisionRulesCase;
  readonly released: ReadonlyMap<number, boolean>;
}

const REPLAY_DIR = 'recorded/containment/replay';

const CORPUS_FILES = [
  ['consent-near-miss.json', 'near-miss.json'],
  ['real-traffic.json', 'real-traffic.json'],
] as const;

export const containmentReplay = defineExperiment<ReplayCase>({
  name: 'containment-replay',
  description:
    'Replays the recorded Jev answers for the consent near-misses and the real traffic, ' +
    'with the containment check in the cwd scope beside them. Sends nothing.',
  corpus: 'decision-rules',
  samples: 3,
  inputs: CORPUS_FILES.map(([, replayFile]) => `${REPLAY_DIR}/${replayFile}`),
  loadCases: async (corpusDir) => {
    const replayDir = join(dirname(corpusDir), REPLAY_DIR);

    const loaded = await Promise.all(
      CORPUS_FILES.map(async ([corpusFile, replayFile]) => {
        const [cases, replay] = await Promise.all([
          loadDecisionRulesCases(join(corpusDir, corpusFile)),
          loadCorpus(join(replayDir, replayFile), replaySamplesSchema),
        ]);

        return cases.map((call) => ({
          call,
          released: buildReleased(call.id, replay.data.records),
        }));
      }),
    );

    return new Map(loaded.flat().map((entry) => [entry.call.id, entry]));
  },
  stages: [
    {
      name: 'containment',
      sends: false,
      run: async (entry, context) => {
        if (!entry.case.released.has(context.sample)) {
          return buildAbsentSample(context.sample);
        }

        const deny = await checkCwdContainment(entry.case.call, entry.case.call.repository);

        return deny === null
          ? { status: 'scored', verdict: 'allow', pBlock: null, reason: null }
          : { status: 'scored', verdict: 'deny', pBlock: null, reason: deny.reason };
      },
    },
    {
      name: 'jev-recorded',
      sends: false,
      run: (entry, context) => {
        const released = entry.case.released.get(context.sample);

        if (released === undefined) {
          return Promise.resolve(buildAbsentSample(context.sample));
        }

        const outcome: StageOutcome = released
          ? { status: 'scored', verdict: 'allow', pBlock: null, reason: null }
          : {
              status: 'scored',
              verdict: 'deny',
              pBlock: null,
              reason: 'The recorded answer falls short of release-all-allow.',
            };

        return Promise.resolve(outcome);
      },
    },
  ],
  measurements: [collectCatastrophicAllows, collectBenignDenials],
});

// A recording repeats some samples; a repeat that disagrees would make the
// replay depend on file order, so it is refused.
function buildReleased(
  id: string,
  records: readonly (readonly [string, number, 0 | 1])[],
): Map<number, boolean> {
  const released = new Map<number, boolean>();

  for (const [caseID, sample, value] of records) {
    if (caseID !== id) {
      continue;
    }

    const held = released.get(sample);

    if (held !== undefined && held !== (value === 1)) {
      throw new Error(`The recording disagrees with itself on ${id} sample ${sample}.`);
    }

    released.set(sample, value === 1);
  }

  return released;
}

// The recordings hold fewer samples for real traffic than for the near-misses.
function buildAbsentSample(sample: number): StageOutcome {
  return { status: 'skipped', reason: `The recording holds no sample ${sample}.` };
}
