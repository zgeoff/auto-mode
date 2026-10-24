import { basename, join } from 'node:path';
import { match } from 'ts-pattern';
import * as z from 'zod';
import { answerGuidanceCorpusSchema } from './answer-guidance-corpus-schema.ts';
import { taskScopeSessionsSchema } from './corpora/task-scope-sessions-schema.ts';
import { decisionRulesCorpusSchema } from './decision-rules-corpus-schema.ts';
import { loadCorpus } from './load-corpus.ts';
import { relayConsentCorpusSchema } from './relay-consent-corpus-schema.ts';
import { staleConsentCorpusSchema } from './stale-consent-corpus-schema.ts';

export interface CorpusCaseKeys {
  readonly key: string;
  readonly keys: readonly string[];
}

const namedCaseSchema = z.object({ name: z.string() });
const namedCasesSchema = z.object({ cases: z.array(namedCaseSchema) });
const idCaseSchema = z.object({ id: z.string() });
const idCasesSchema = z.object({ cases: z.array(idCaseSchema) });

export function loadCaseKeys(corpusDir: string): Promise<CorpusCaseKeys> {
  const corpus = basename(corpusDir);

  return match(corpus)
    .returnType<Promise<CorpusCaseKeys>>()
    .with('answer-guidance', async () => {
      const loaded = await loadCorpus(join(corpusDir, 'cases.json'), answerGuidanceCorpusSchema);

      return { key: 'name', keys: loaded.data.cases.map((entry) => entry.name) };
    })
    .with('applicability', async () => {
      const loaded = await loadCorpus(join(corpusDir, 'cases.json'), namedCasesSchema);

      return { key: 'name', keys: loaded.data.cases.map((entry) => entry.name) };
    })
    .with('containment', async () => {
      const loaded = await loadCorpus(join(corpusDir, 'twins.json'), idCasesSchema);

      return { key: 'id', keys: loaded.data.cases.map((entry) => entry.id) };
    })
    .with('decision-rules', async () => {
      const [nearMiss, realTraffic] = await Promise.all([
        loadCorpus(join(corpusDir, 'consent-near-miss.json'), decisionRulesCorpusSchema),
        loadCorpus(join(corpusDir, 'real-traffic.json'), decisionRulesCorpusSchema),
      ]);

      const cases = [...nearMiss.data.cases, ...realTraffic.data.cases];

      return { key: 'id', keys: cases.map((entry) => entry.id) };
    })
    .with('default-branch-write', 'held-out', 'hook-bypass', 'question-severity', async () => {
      const loaded = await loadCorpus(join(corpusDir, 'cases.json'), decisionRulesCorpusSchema);

      return { key: 'id', keys: loaded.data.cases.map((entry) => entry.id) };
    })
    .with('relay-consent', async () => {
      const loaded = await loadCorpus(join(corpusDir, 'cases.json'), relayConsentCorpusSchema);

      return { key: 'action/cell', keys: buildRelayConsentKeys(loaded.data) };
    })
    .with('second-judge', async () => {
      const loaded = await loadCorpus(join(corpusDir, 'cases.json'), idCasesSchema);

      return { key: 'id', keys: loaded.data.cases.map((entry) => entry.id) };
    })
    .with('stale-consent', async () => {
      const loaded = await loadCorpus(join(corpusDir, 'cases.json'), staleConsentCorpusSchema);

      return { key: 'pair/arm', keys: buildStaleConsentKeys(loaded.data) };
    })
    .with('task-scope', async () => {
      const loaded = await loadCorpus(join(corpusDir, 'sessions.json'), taskScopeSessionsSchema);

      return { key: 'name', keys: loaded.data.sessions.map((session) => session.name) };
    })
    .otherwise(() =>
      Promise.reject(new Error(`No case keys are defined for the corpus ${corpus}.`)),
    );
}

interface RelayConsentCases {
  readonly actions: readonly { readonly id: string; readonly label: 'risky' | 'safe' }[];
  readonly cells: Readonly<Record<'risky' | 'safe', readonly { readonly id: string }[]>>;
}

function buildRelayConsentKeys(corpus: RelayConsentCases): string[] {
  return corpus.actions.flatMap((action) => {
    const cells = corpus.cells[action.label];

    return cells.map((cell) => `${action.id}/${cell.id}`);
  });
}

interface StaleConsentPairs {
  readonly pairs: readonly { readonly pair: number }[];
}

function buildStaleConsentKeys(corpus: StaleConsentPairs): string[] {
  return corpus.pairs.flatMap((entry) => {
    const pair = String(entry.pair);

    return [`${pair}/stale`, `${pair}/null`];
  });
}
