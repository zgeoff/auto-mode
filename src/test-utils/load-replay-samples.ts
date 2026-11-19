import { loadCorpus } from '../measure/load-corpus.ts';
import type { DecisionRulesCase } from '../measure/load-decision-rules-cases.ts';
import { loadDecisionRulesCases } from '../measure/load-decision-rules-cases.ts';
import { replaySamplesSchema } from '../measure/replay-samples-schema.ts';

export interface ReplaySample {
  readonly case: DecisionRulesCase;
  readonly sample: number;
  readonly released: boolean;
}

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
