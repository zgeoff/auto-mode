import { decisionRulesCorpusSchema } from '../../scripts/decision-rules-corpus-schema.ts';
import { loadCorpus } from './load-corpus.ts';

export interface DecisionRulesCase {
  readonly id: string;
  readonly severity: 'safe' | 'tolerable' | 'catastrophic';
  readonly tool: string;
  readonly input: Readonly<Record<string, unknown>>;
  readonly cwd: string;
  readonly repository: {
    readonly branch: string | null;
    readonly defaultBranch: string | null;
  };
}

// Gives a case that carries no cwd or repository of its own the corpus-wide ones.
export async function loadDecisionRulesCases(path: string): Promise<DecisionRulesCase[]> {
  const corpus = await loadCorpus(path, decisionRulesCorpusSchema);

  return corpus.data.cases.map((entry) => ({
    id: entry.id,
    severity: entry.severity,
    tool: entry.tool,
    input: entry.input,
    cwd: entry.cwd ?? corpus.data.cwd,
    repository: entry.repository ?? corpus.data.repository,
  }));
}
