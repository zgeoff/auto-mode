import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import invariant from 'tiny-invariant';
import * as z from 'zod';
import { loadConfig, resolveApiKey } from '../src/config/config.ts';
import { loadClaudeRules } from '../src/config/load-claude-rules.ts';
import { readHostEnvironment } from '../src/config/read-host-environment.ts';
import { toTimerDelay } from '../src/config/to-timer-delay.ts';
import { pickEvaluationVerdict } from '../src/evaluation/pick-evaluation-verdict.ts';
import { buildDecisionRequest } from '../src/model/build-decision-request.ts';
import { DecisionRequestError } from '../src/model/decision-request-error.ts';
import { sendDecision } from '../src/model/send-decision.ts';
import type { DecisionRequest } from '../src/model/types.ts';
import { loadPolicy } from '../src/policy/load-policy.ts';
import type { ActionRequest } from '../src/request/types.ts';
import { buildRelayConsentSummary } from './build-relay-consent-summary.ts';
import {
  RELAY_CONSENT_THRESHOLD as THRESHOLD,
  relayConsentCorpusSchema,
} from './relay-consent-corpus-schema.ts';
import { relayConsentSegmentSchema } from './relay-consent-segment-schema.ts';

const MAX_REQUESTS = 988;
const PLANNED_REQUESTS = 760;

async function main(): Promise<void> {
  const args = parseArgs({
    options: {
      live: { type: 'boolean' },
      output: { type: 'string' },
      resume: { type: 'boolean' },
      summarize: { type: 'string' },
    },
  });

  const root = resolve(import.meta.dirname, '..');

  const corpusText = await readFile(join(root, 'fixtures/relay-consent/cases.json'), 'utf8');

  const corpus = parseCorpus(corpusText);
  const corpusHash = toHash(JSON.stringify(corpus));

  if (args.values.summarize !== undefined) {
    await writeSummary(args.values.summarize, corpusHash);

    return;
  }

  const output = args.values.output;
  const isLive = args.values.live === true;

  invariant(
    !isLive || output !== undefined,
    'Pass --live --output <path> to send requests; without --live the script only builds them.',
  );

  const config = await loadConfig();

  invariant(
    config.provider.protocol === 'system-one' &&
      config.rulesPath === undefined &&
      config.classifierPath === undefined,
    'Evaluate the shipped Jev policy with no replacement policy.',
  );

  invariant((config.minConfidence ?? THRESHOLD) === THRESHOLD, 'Keep the threshold at 0.8.');
  invariant(config.provider.model === corpus.model, 'The configured model is the frozen model.');

  const configuredRules = await loadClaudeRules(config.claudeSettingsPath, readHostEnvironment());
  const policy = await loadPolicy({}, 'decision.md');

  const variants = corpus.actions.flatMap((action) =>
    corpus.cells[action.label].map((cell) => {
      const text = cell.message === null ? null : action.messages[cell.message];

      invariant(text !== undefined, 'Every cell names a message its action holds.');

      // Mirrors the Claude mod payload for a main-agent call; the original task is
      // held unavailable in every cell so only the direct message varies.
      const payload: ActionRequest = {
        sessionID: 'relay-consent-evaluation',
        cwd: corpus.cwd,
        toolName: action.tool,
        toolInput: action.input,
        decisionContext: {
          agentID: null,
          originalUserTask: null,
          delegatedTask: null,
          lastDirectUserMessage: text === null ? null : { text, origin: corpus.messageOrigin },
          omittedTaskContext: [{ field: 'originalUserTask', reason: 'unavailable' }],
        },
      };

      const base = buildDecisionRequest(
        payload,
        policy,
        configuredRules,
        text,
        'shipped',
        action.repositoryContext,
      );

      const request =
        cell.presentation === 'mark' ? buildMarkedRequest(base, corpus.markGuidance) : base;

      return {
        action,
        cell,
        request,
        controlHash: toControlHash(request, corpus.markGuidance),
        requestHash: toHash(JSON.stringify(request)),
      };
    }),
  );

  for (const action of corpus.actions) {
    const hashes = new Set(
      variants.filter((item) => item.action.id === action.id).map((item) => item.controlHash),
    );

    invariant(hashes.size === 1, 'Every cell of an action differs only in the message part.');

    const gatingRules = Object.values(variants[0]?.request.rules ?? {}).filter(
      (rule) => rule.name === action.gatingRule,
    );

    invariant(gatingRules.length === 1, 'Every action names one shipped gating rule.');
  }

  const plan = variants.flatMap((variant) =>
    Array.from({ length: corpus.repeats }, (_, index) => ({ ...variant, repeat: index + 1 })),
  );

  invariant(plan.length === PLANNED_REQUESTS, 'The plan is the 760 requests the ticket fixes.');
  invariant(plan.length <= MAX_REQUESTS, 'The plan exceeds the request allocation.');

  const schedule = sortSeeded(plan, corpus.seed);

  const scheduleHash = toHash(
    schedule.map((item) => `${item.action.id}|${item.cell.id}|${item.repeat}`).join('\n'),
  );

  const records: unknown[] = [];

  interface Segment {
    runnerCommit: string | null;
    startedAt: string | null;
    completedAt: string | null;
    firstIndex: number | null;
    lastIndex: number | null;
    stoppedEarly: 'failure' | 'model-changed' | null;
  }

  const segments: Segment[] = [];

  const report = {
    model: corpus.model,
    threshold: THRESHOLD,
    repeats: corpus.repeats,
    retries: 0,
    redirects: 'error',
    planned: schedule.length,
    maxRequests: MAX_REQUESTS,
    attemptedRequests: 0,
    segments,
    policyHash: toHash(policy),
    configuredRulesHash: toHash(JSON.stringify(configuredRules)),
    configuredRuleCounts: {
      environment: configuredRules.environment.length,
      allow: configuredRules.allow.length,
      soft_deny: configuredRules.soft_deny.length,
      hard_deny: configuredRules.hard_deny.length,
    },
    corpusHash,
    markGuidanceHash: toHash(corpus.markGuidance),
    scheduleHash,
    controlHashes: Object.fromEntries(
      corpus.actions.map((action) => [
        action.id,
        variants.find((item) => item.action.id === action.id)?.controlHash,
      ]),
    ),
    summary: null as ReturnType<typeof buildRelayConsentSummary> | null,
    records,
  };

  if (!isLive) {
    for (const variant of variants) {
      const state = JSON.stringify(variant.request.state);

      console.log(
        JSON.stringify({
          action: variant.action.id,
          cell: variant.cell.id,
          stateBytes: Buffer.byteLength(state),
          requestHash: variant.requestHash,
          controlHash: variant.controlHash,
        }),
      );
    }

    const { records: _records, summary: _summary, ...freeze } = report;

    console.log(JSON.stringify(freeze, null, 2));

    return;
  }

  invariant(output !== undefined, 'A live run writes a report.');

  const runnerCommit = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: root,
    encoding: 'utf8',
  }).trim();

  const changes = execFileSync(
    'git',
    ['status', '--porcelain', '--', 'fixtures', 'policy', 'scripts', 'src'],
    { cwd: root, encoding: 'utf8' },
  );

  invariant(changes.trim() === '', 'Commit the corpus, runner, and source before a live run.');

  const sentIndices = new Set<number>();

  let responseModel: string | null = null;

  if (args.values.resume === true) {
    const previousText = await readFile(output, 'utf8');

    const previous = parseReport(previousText);

    invariant(
      previous.policyHash === report.policyHash &&
        previous.configuredRulesHash === report.configuredRulesHash &&
        previous.corpusHash === report.corpusHash &&
        previous.markGuidanceHash === report.markGuidanceHash &&
        previous.scheduleHash === report.scheduleHash &&
        JSON.stringify(previous.controlHashes) === JSON.stringify(report.controlHashes),
      'A resumed run keeps every frozen hash.',
    );

    invariant(
      previous.records.every(
        (record) => schedule[record.index]?.requestHash === record.requestHash,
      ),
      'A resumed run rebuilds every recorded request unchanged.',
    );

    records.push(...previous.records);
    segments.push(...previous.segments);

    report.attemptedRequests = previous.attemptedRequests;
    responseModel = previous.records.find((record) => record.model !== undefined)?.model ?? null;

    for (const record of previous.records) {
      sentIndices.add(record.index);
    }
  }

  const segment: Segment = {
    runnerCommit,
    startedAt: new Date().toISOString(),
    completedAt: null,
    firstIndex: null,
    lastIndex: null,
    stoppedEarly: null,
  };

  segments.push(segment);

  // Written before the first request and after each answer, so an unwritable path
  // fails before any request and an interrupted run keeps the answers it spent.
  await writeReport(output, report);

  const key = await resolveApiKey(config.provider);

  invariant(key !== null, 'The configured evaluation credential is unavailable.');

  // Every network attempt is counted here, and a redirect fails instead of
  // sending a second, uncounted request. A copy of each response is held so a
  // rejected answer can be recorded.
  const sendFetch = globalThis.fetch;
  const responses: ReturnType<Awaited<ReturnType<typeof fetch>>['clone']>[] = [];

  // oxlint-disable-next-line typescript/prefer-readonly-parameter-types -- fetch's own signature takes a mutable Request or URL
  const sendCountedFetch: (...args: Parameters<typeof fetch>) => ReturnType<typeof fetch> = async (
    input,
    init,
  ) => {
    invariant(report.attemptedRequests < MAX_REQUESTS, 'The request allocation is spent.');

    report.attemptedRequests += 1;

    const response = await sendFetch(input, { ...init, redirect: 'error' });

    responses.push(response.clone());

    return response;
  };

  globalThis.fetch = Object.assign(sendCountedFetch, sendFetch);

  for (const [index, item] of schedule.entries()) {
    if (sentIndices.has(index)) {
      continue;
    }

    segment.firstIndex ??= index;
    segment.lastIndex = index;
    responses.length = 0;

    const base = {
      index,
      action: item.action.id,
      kind: item.action.kind,
      label: item.action.label,
      cell: item.cell.id,
      presentation: item.cell.presentation,
      message: item.cell.message,
      repeat: item.repeat,
      expected: item.cell.expected,
      requestHash: item.requestHash,
      controlHash: item.controlHash,
    };

    const started = performance.now();

    try {
      const result = await sendDecision(
        config.provider,
        key,
        item.request,
        AbortSignal.timeout(toTimerDelay(config.provider.timeoutMs)),
      );

      const verdict = pickEvaluationVerdict(item.request, result, THRESHOLD);

      const answers = Object.fromEntries(
        Object.entries(item.request.rules).map(([id, rule]) => {
          const answer = result.answers[id];

          invariant(answer !== undefined, 'The validated response contains every rule.');

          return [
            rule.source === 'shipped' ? rule.name : id,
            [
              answer.choice,
              answer.confidence,
              answer.probabilities.allow,
              answer.probabilities.block,
              answer.probabilities.ask,
            ],
          ];
        }),
      );

      records.push({
        ...base,
        model: result.model,
        status: verdict.kind,
        rule: verdict.kind === 'deny' ? verdict.rule : null,
        gating: answers[item.action.gatingRule] ?? null,
        requestBytes: result.requestBytes,
        inputTokens: result.inputTokens,
        elapsedMs: Math.round(performance.now() - started),
        answers,
      });

      responseModel ??= result.model;

      if (result.model !== responseModel) {
        segment.stoppedEarly = 'model-changed';
      }

      console.log(JSON.stringify({ index, cell: base.cell, status: verdict.kind }));
    } catch (error) {
      segment.stoppedEarly = 'failure';

      const response = responses.at(-1);
      let body: string | null = null;

      // A body stream that failed for the decision client fails for its copy too; the
      // failure record must still be written so a resume never resends this index.
      try {
        body = response === undefined ? null : await response.text();
      } catch {
        body = null;
      }

      records.push({
        ...base,
        status: 'failure',
        failure: error instanceof DecisionRequestError ? error.reason : 'other',
        failureHTTPStatus: response?.status ?? null,
        failureBody: body === null ? null : body.slice(0, 65_536),
        elapsedMs: Math.round(performance.now() - started),
        gating: null,
        answers: null,
      });

      console.log(JSON.stringify({ index, cell: base.cell, status: 'failure' }));
    }

    await writeReport(output, report);

    if (segment.stoppedEarly !== null) {
      break;
    }
  }

  segment.completedAt = new Date().toISOString();

  report.summary = buildRelayConsentSummary(records);

  await writeReport(output, report);
}

function parseCorpus(text: string) {
  return relayConsentCorpusSchema.parse(JSON.parse(text));
}

// A report written before segments existed holds one run's start, end, and stop
// reason at the top level; it becomes the first segment.
function parseReport(text: string) {
  const recordSchema = z.looseObject({
    index: z.number().int(),
    requestHash: z.string(),
    model: z.string().optional(),
  });

  const report = z
    .looseObject({
      policyHash: z.string(),
      configuredRulesHash: z.string(),
      corpusHash: z.string(),
      markGuidanceHash: z.string(),
      scheduleHash: z.string(),
      controlHashes: z.record(z.string(), z.string()),
      attemptedRequests: z.number().int(),
      startedAt: z.string().nullable().optional(),
      completedAt: z.string().nullable().optional(),
      stoppedEarly: z.enum(['failure', 'model-changed']).nullable().optional(),
      segments: z.array(relayConsentSegmentSchema).optional(),
      records: z.array(recordSchema),
    })
    .parse(JSON.parse(text));

  const indices = report.records.map((record) => record.index);
  const { startedAt, completedAt, stoppedEarly, segments, ...rest } = report;

  return {
    ...rest,
    segments: segments ?? [
      {
        runnerCommit: null,
        startedAt: startedAt ?? null,
        completedAt: completedAt ?? null,
        firstIndex: indices.length === 0 ? null : Math.min(...indices),
        lastIndex: indices.length === 0 ? null : Math.max(...indices),
        stoppedEarly: stoppedEarly ?? null,
      },
    ],
  };
}

// The mark prototype: the stale message moves out of the current-evidence field
// into task context with a staleness field, and the guidance gains one
// restrict-only instruction.
function buildMarkedRequest(base: DecisionRequest, guidance: string): DecisionRequest {
  const context = base.state.taskContext;

  invariant(context !== undefined, 'A marked cell carries task context.');

  const message = context.lastDirectUserMessage;

  invariant(message !== null, 'A marked cell carries a message.');

  return {
    ...base,
    state: {
      ...base.state,
      answerGuidance: `${base.state.answerGuidance} ${guidance}`,
      lastUserMessage: null,
      taskContext: {
        ...context,
        lastDirectUserMessage: { ...message, freshness: 'stale' } as typeof message,
      },
    },
  };
}

function sortSeeded<T>(items: readonly T[], seed: number): T[] {
  const fractions = buildSeededFractions(seed, items.length);
  const order = items.map((_, index) => index);

  for (let index = order.length - 1; index > 0; index -= 1) {
    const swap = Math.floor((fractions[index] ?? 0) * (index + 1));
    const held = order[index] ?? index;

    order[index] = order[swap] ?? swap;
    order[swap] = held;
  }

  return order.map((index) => {
    const item = items[index];

    invariant(item !== undefined, 'The order is a permutation of the items.');

    return item;
  });
}

// mulberry32: a small, fixed generator, so the order is reproducible from the seed alone.
function buildSeededFractions(seed: number, count: number): number[] {
  const fractions: number[] = [];
  let state = seed >>> 0;

  for (let index = 0; index < count; index += 1) {
    state = (state + 0x6d_2b_79_f5) >>> 0;

    let value = state;

    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);

    fractions.push(((value ^ (value >>> 14)) >>> 0) / 4_294_967_296);
  }

  return fractions;
}

async function writeSummary(path: string, corpusHash: string): Promise<void> {
  const text = await readFile(path, 'utf8');

  const report = z
    .looseObject({ corpusHash: z.literal(corpusHash), records: z.array(z.unknown()) })
    .parse(JSON.parse(text));

  await writeReport(path, { ...report, summary: buildRelayConsentSummary(report.records) });
}

async function writeReport(path: string, report: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(report, null, 2)}\n`);
}

function toControlHash(request: DecisionRequest, markGuidance: string): string {
  const taskContext = request.state.taskContext;
  const guidance = request.state.answerGuidance;
  const suffix = ` ${markGuidance}`;

  return toHash(
    JSON.stringify({
      ...request,
      state: {
        ...request.state,
        answerGuidance: guidance.endsWith(suffix) ? guidance.slice(0, -suffix.length) : guidance,
        lastUserMessage: null,
        ...(taskContext === undefined
          ? {}
          : { taskContext: { ...taskContext, lastDirectUserMessage: null } }),
      },
    }),
  );
}

function toHash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

await main();
