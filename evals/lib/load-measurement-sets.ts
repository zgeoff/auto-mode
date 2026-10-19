import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import type { ActionRequest } from 'auto-mode';
import { repositoryContextSchema } from 'auto-mode/eval';
import type { ClaudeRules, RepositoryContext, buildDecisionRequest } from 'auto-mode/eval';
import * as z from 'zod';
import { decisionRulesCorpusSchema } from './decision-rules-corpus-schema.ts';
import type { CaseSet } from './define-experiment.ts';
import type { JevReport } from './jev-report-schema.ts';
import type { JudgeReport } from './judge-report-schema.ts';
import { loadCorpus } from './load-corpus.ts';
import { loadSecondJudgeCorpus } from './load-second-judge-corpus.ts';
import type { SampleRecord } from './sample-record-schema.ts';

type MCPServerFacts = NonNullable<Parameters<typeof buildDecisionRequest>[2]['mcpServers']>;

// A recorded answer for one sample of one stage, in the form its report kept.
export type RecordedSample =
  | {
      readonly kind: 'jev-record';
      readonly record: JevReport['records'][number];
      readonly model: string;
    }
  | { readonly kind: 'release'; readonly released: boolean; readonly model: string }
  | {
      readonly kind: 'judge';
      readonly record: JudgeReport['records'][number];
      readonly model: string;
    }
  | { readonly kind: 'sample'; readonly record: SampleRecord; readonly model: string };

// Zero-based sample index to the recorded answer of that sample.
export type RecordedSamples = Readonly<Record<number, RecordedSample>>;

export interface MeasurementCase {
  readonly id: string;
  readonly action: ActionRequest;
  readonly lastUserMessage: string | null;
  readonly repository: RepositoryContext;
  readonly mcpServers: MCPServerFacts;

  // The configured rules a corpus fixes for its cases; null takes the run's own.
  readonly configuredRules: ClaudeRules | null;

  // Stage name to the recorded answers a replay returns.
  readonly recorded: Readonly<Record<string, RecordedSamples>>;
}

export type MeasurementCorpus =
  | 'answer-guidance'
  | 'containment'
  | 'default-branch-write'
  | 'decision-rules'
  | 'question-severity'
  | 'second-judge';

export interface MeasurementSets {
  readonly sets: CaseSet<MeasurementCase>[];
  readonly notMeasured: string[];
}

const HELD_OUT = 'held-out';

// Each corpus becomes one set of cases that can build a live request, run the
// containment check, and take recorded answers. The held-out set lives only in
// the results clone; a run without it says so instead of counting it as empty.
export async function loadMeasurementSets(
  corporaDir: string,
  resultsDir: string | null,
  corpora: readonly MeasurementCorpus[],
  withHeldOut: boolean,
): Promise<MeasurementSets> {
  const sets: CaseSet<MeasurementCase>[] = await Promise.all(
    corpora.map(async (corpus) => ({
      corpus,
      directory: join(corporaDir, corpus),
      cases: await loadCorpusCases(corporaDir, corpus),
    })),
  );

  const notMeasured: string[] = [];

  if (withHeldOut) {
    const directory = resultsDir === null ? null : join(resultsDir, HELD_OUT);

    if (directory !== null && existsSync(directory)) {
      const cases = await loadDecisionRulesFile(join(directory, 'cases.json'));

      sets.push({ corpus: HELD_OUT, directory, cases });
    } else {
      const reason =
        resultsDir === null
          ? 'held-out set: no results clone named, so the held-out set was not read'
          : `held-out set: the results clone holds no ${HELD_OUT}/ directory`;

      notMeasured.push(reason);
    }
  }

  return { sets, notMeasured };
}

async function loadCorpusCases(
  corporaDir: string,
  corpus: MeasurementCorpus,
): Promise<Record<string, MeasurementCase>> {
  if (corpus === 'containment') {
    return loadTwins(corporaDir);
  }

  if (corpus === 'question-severity' || corpus === 'default-branch-write') {
    return loadDecisionRulesFile(join(corporaDir, corpus, 'cases.json'));
  }

  if (corpus === 'decision-rules') {
    const [nearMiss, realTraffic] = await Promise.all([
      loadDecisionRulesFile(join(corporaDir, corpus, 'consent-near-miss.json')),
      loadDecisionRulesFile(join(corporaDir, corpus, 'real-traffic.json')),
    ]);

    return { ...nearMiss, ...realTraffic };
  }

  // The answer-guidance cases are the second-judge corpus's frozen cases,
  // keyed by name as that corpus's labels key them.
  const loaded = await loadSecondJudgeCorpus(resolve(corporaDir, '../..'));

  const sources = corpus === 'second-judge' ? ['real', 'control'] : ['frozen'];

  const entries = loaded.cases
    .filter((entry) => sources.includes(entry.source))
    .map((entry): [string, MeasurementCase] => {
      const key = corpus === 'second-judge' ? entry.id : entry.name;

      const built = buildCase(entry.id, entry.tool, entry.input, {
        lastUserMessage: entry.lastUserMessage,
        repository: entry.repositoryContext,
        mcpServers: [],
        configuredRules: loaded.configuredRules,
      });

      return [key, built];
    });

  return Object.fromEntries(entries);
}

const contextsSchema = z.object({
  contexts: z.record(z.string(), repositoryContextSchema),
});

const twinSchema = z.object({
  id: z.string(),
  message: z.string(),
  context: z.string(),
  tool: z.string(),
  input: z.record(z.string(), z.unknown()),
});

const twinsSchema = z.object({ cases: z.array(twinSchema) });

// A consent twin borrows its repository context and configured rules from the
// second-judge corpus, whose controls it pairs with.
async function loadTwins(corporaDir: string): Promise<Record<string, MeasurementCase>> {
  const [twins, contexts, judged] = await Promise.all([
    loadCorpus(join(corporaDir, 'containment/twins.json'), twinsSchema),
    loadCorpus(join(corporaDir, 'second-judge/cases.json'), contextsSchema),
    loadSecondJudgeCorpus(resolve(corporaDir, '../..')),
  ]);

  return Object.fromEntries(
    twins.data.cases.map((twin) => {
      const repository = contexts.data.contexts[twin.context];

      if (repository === undefined) {
        throw new Error(`The twin ${twin.id} names an unknown context ${twin.context}.`);
      }

      return [
        twin.id,
        buildCase(twin.id, twin.tool, twin.input, {
          lastUserMessage: twin.message,
          repository,
          mcpServers: [],
          configuredRules: judged.configuredRules,
        }),
      ];
    }),
  );
}

interface CaseOptions {
  readonly lastUserMessage: string | null;
  readonly repository: RepositoryContext;
  readonly mcpServers: MCPServerFacts;
  readonly configuredRules: ClaudeRules | null;
}

const SESSION_ID = 'measurement-experiment';

function buildCase(
  id: string,
  tool: string,
  input: Readonly<Record<string, unknown>>,
  options: Readonly<CaseOptions>,
): MeasurementCase {
  const repository = options.repository;
  const toolInput = { ...input };
  const file = toolInput['file_path'];

  if (typeof file === 'string' && !isAbsolute(file)) {
    toolInput['file_path'] = join(repository.cwd, file);
  }

  return {
    id,
    action: { sessionID: SESSION_ID, cwd: repository.cwd, toolName: tool, toolInput },
    lastUserMessage: options.lastUserMessage,
    repository,
    mcpServers: options.mcpServers,
    configuredRules: options.configuredRules,
    recorded: {},
  };
}

// A decision-rules case may leave out its message, cwd, repository and MCP
// servers, and takes the corpus-wide ones; a relative file path is joined to the cwd.
async function loadDecisionRulesFile(path: string): Promise<Record<string, MeasurementCase>> {
  const text = await readFile(path, 'utf8');

  const corpus = decisionRulesCorpusSchema.parse(JSON.parse(text));

  return Object.fromEntries(
    corpus.cases.map((entry) => {
      const cwd = entry.cwd ?? corpus.cwd;
      const repository = { cwd, ...(entry.repository ?? corpus.repository) };

      return [
        entry.id,
        buildCase(entry.id, entry.tool, entry.input, {
          lastUserMessage: entry.lastUserMessage ?? corpus.lastUserMessage,
          repository,
          mcpServers: entry.mcpServers ?? corpus.mcpServers ?? [],
          configuredRules: null,
        }),
      ];
    }),
  );
}
