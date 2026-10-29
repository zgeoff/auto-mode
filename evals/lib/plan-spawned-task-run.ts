import { buildDecisionRequest, resolveOpeningPrompt } from 'auto-mode/eval';
import type { ClaudeRules, DecisionRequest } from 'auto-mode/eval';
import invariant from 'tiny-invariant';
import type * as z from 'zod';
import type { spawnedTaskCorpusSchema } from './spawned-task-corpus-schema.ts';
import { toHash } from './to-hash.ts';

export interface SpawnedTaskRunOptions {
  readonly corpus: z.output<typeof spawnedTaskCorpusSchema>;
  readonly policy: string;
  readonly configuredRules: ClaudeRules;
  readonly model: string;
  readonly blockThreshold: number;
  readonly samples: number;
  readonly isLive: boolean;
  readonly output: string | undefined;
  readonly startedAt: string;
}

export interface PlannedCase {
  readonly name: string;
  readonly request: DecisionRequest;
  readonly requestHash: string;
}

export interface PlannedSend {
  readonly plannedCase: PlannedCase;
  readonly sample: number;
}

export type SpawnedTaskRunPlan =
  | { readonly kind: 'dry'; readonly cases: readonly PlannedCase[] }
  | {
      readonly kind: 'live';
      readonly output: string;
      readonly sends: readonly PlannedSend[];
      readonly report: Readonly<Record<string, unknown>>;
    };

const MAX_SENDS = 32;

export async function planSpawnedTaskRun(
  options: Readonly<SpawnedTaskRunOptions>,
): Promise<SpawnedTaskRunPlan> {
  invariant(
    Number.isInteger(options.samples) && options.samples >= 1,
    'Pass --samples as a positive integer.',
  );

  const cases = await Promise.all(
    options.corpus.cases.map((entry) => resolvePlannedCase(entry, options)),
  );

  if (!options.isLive) {
    return { kind: 'dry', cases };
  }

  invariant(
    options.output !== undefined,
    'Pass --live --output <path> to send requests; without --live the script only builds them.',
  );

  invariant(
    cases.length * options.samples <= MAX_SENDS,
    `The evaluation sends at most ${String(MAX_SENDS)} requests.`,
  );

  const sends = cases.flatMap((plannedCase) =>
    Array.from({ length: options.samples }, (_, index) => ({ plannedCase, sample: index + 1 })),
  );

  return {
    kind: 'live',
    output: options.output,
    sends,
    report: {
      model: options.model,
      blockThreshold: options.blockThreshold,
      samplesPerCase: options.samples,
      retries: 0,
      startedAt: options.startedAt,
      completedAt: null,
      policyHash: toHash(options.policy),
      configuredRulesHash: toHash(JSON.stringify(options.configuredRules)),
      corpusHash: toHash(JSON.stringify(options.corpus)),
    },
  };
}

type CorpusCase = SpawnedTaskRunOptions['corpus']['cases'][number];

async function resolvePlannedCase(
  entry: CorpusCase,
  options: Readonly<SpawnedTaskRunOptions>,
): Promise<PlannedCase> {
  const opening = { text: entry.openingPrompt, origin: 'composer', position: 'opening' } as const;

  // The scope file a launcher writes for a session it spawned, read from memory
  // so planning reads and writes no file.
  const scopeText = JSON.stringify({
    format: 'auto-mode.scope',
    version: 1,
    replyChannels: [
      { tool: 'mcp__atc__atc_message_send', field: 'session', recipient: options.corpus.spawner },
    ],
  });

  const resolved = await resolveOpeningPrompt(
    {
      sessionID: 'spawned-task-evaluation',
      cwd: options.corpus.cwd,
      toolName: entry.tool,
      toolInput: entry.input,
      decisionContext: {
        agentID: null,
        originalUserTask: opening,
        delegatedTask: null,
        lastDirectUserMessage: opening,
        omittedTaskContext: [],
      },
    },
    {
      host: { env: { AUTO_MODE_SCOPE_FILE: '/launcher/scope.json' }, home: '/launcher' },
      readTextFile: () => Promise.resolve(scopeText),
    },
  );

  invariant(
    resolved.decisionContext?.delegatedTask?.origin === 'agent.spawn' &&
      resolved.decisionContext.originalUserTask === null &&
      resolved.decisionContext.lastDirectUserMessage === null,
    'A spawned opening prompt reaches Jev as the delegated task alone.',
  );

  const request = buildDecisionRequest(resolved, options.policy, {
    configuredRules: options.configuredRules,
    lastUserMessage: null,
    rulesSource: 'shipped',
    repositoryContext: null,
  });

  return { name: entry.name, request, requestHash: toHash(JSON.stringify(request)) };
}
