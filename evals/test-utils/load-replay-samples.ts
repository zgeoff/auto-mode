import { replaySamplesSchema } from './corpora/replay-samples-schema.ts';
import { loadCorpus } from './load-corpus.ts';
import type { DecisionRulesCase } from './load-decision-rules-cases.ts';
import { loadDecisionRulesCases } from './load-decision-rules-cases.ts';

export interface ReplaySample {
  readonly case: DecisionRulesCase;
  readonly sample: number;
  readonly released: boolean;
}

// Pairs each committed replay sample with the decision-rules case it replays.
export async function loadReplaySamples(
  corpusPath: string,
  replayPath: string,
): Promise<ReplaySample[]> {
  const [corpus, replay] = await Promise.all([
    loadDecisionRulesCases(corpusPath),
    loadCorpus(replayPath, replaySamplesSchema),
  ]);

  const cases = new Map(corpus.map((entry) => [entry.id, entry]));

  return replay.data.records.map(([id, sample, released]) => {
    const entry = cases.get(id);

    if (entry === undefined) {
      throw new Error(`The replay names a case the corpus lacks: ${id}`);
    }

    return { case: entry, sample, released: released === 1 };
  });
}
