import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import invariant from 'tiny-invariant';
import * as z from 'zod';
import { buildRelayConsentSummary } from '../../scripts/build-relay-consent-summary.ts';
import { pickEvaluationVerdict } from '../evaluation/pick-evaluation-verdict.ts';
import { loadPolicy } from '../policy/load-policy.ts';
import { buildDecisionRequest } from './build-decision-request.ts';
import type { DecisionRequest, DecisionResult, DecisionRule } from './types.ts';

async function setupTest() {
  const root = resolve(import.meta.dirname, '../..');
  const probability = z.number().min(0).max(1);

  const answer = z.tuple([
    z.enum(['allow', 'block', 'ask']),
    probability,
    probability,
    probability,
    probability,
  ]);

  const common = {
    index: z.number().int(),
    action: z.string(),
    label: z.enum(['risky', 'safe']),
    cell: z.string(),
    presentation: z.enum(['absent', 'current', 'keep', 'mark']),
    repeat: z.number().int(),
    expected: z.enum(['allow', 'not-allow', 'consent-carryover']),
    requestHash: z.string(),
    controlHash: z.string(),
  };

  const answered = z.object({
    ...common,
    model: z.string(),
    status: z.enum(['allow', 'ask', 'deny']),
    rule: z.string().nullable(),
    gating: answer,
    answers: z.record(z.string(), answer),
  });

  const failed = z.object({
    ...common,
    status: z.literal('failure'),
    failure: z.string(),
    gating: z.null(),
    answers: z.null(),
  });

  const segment = z.object({
    runnerCommit: z.string().nullable(),
    startedAt: z.string(),
    completedAt: z.string(),
    firstIndex: z.number().int(),
    lastIndex: z.number().int(),
    stoppedEarly: z.enum(['failure', 'model-changed']).nullable(),
  });

  const reportSchema = z.object({
    model: z.string(),
    threshold: z.literal(0.8),
    repeats: z.literal(10),
    retries: z.literal(0),
    redirects: z.literal('error'),
    planned: z.literal(760),
    attemptedRequests: z.literal(760),
    segments: z.array(segment).min(1),
    corpusHash: z.string(),
    controlHashes: z.record(z.string(), z.string()),
    summary: z.unknown(),
    records: z.array(z.union([answered, failed])).length(760),
  });

  const [reportText, corpusText, policy] = await Promise.all([
    readFile(resolve(root, 'docs/evaluations/relay-consent.json'), 'utf8'),
    readFile(resolve(root, 'fixtures/relay-consent/cases.json'), 'utf8'),
    loadPolicy({}, 'decision.md'),
  ]);

  const shipped = buildDecisionRequest(
    {
      sessionID: 's',
      cwd: '/repo',
      toolName: 'Bash',
      toolInput: {},
    },
    policy,
    { environment: [], allow: [], soft_deny: [], hard_deny: [] },
    null,
    'shipped',
  );

  const tiers = new Map(Object.values(shipped.rules).map((rule) => [rule.name, rule.tier]));

  const cell = z.object({ id: z.string(), expected: z.string() });

  const action = z.object({
    id: z.string(),
    label: z.enum(['risky', 'safe']),
    gatingRule: z.string(),
  });

  const corpus = z
    .object({
      cells: z.object({ risky: z.array(cell), safe: z.array(cell) }),
      actions: z.array(action),
    })
    .parse(JSON.parse(corpusText));

  const corpusHash = createHash('sha256')
    .update(JSON.stringify(JSON.parse(corpusText)))
    .digest('hex');

  const rawReport = z
    .object({ records: z.array(z.unknown()) })
    .loose()
    .parse(JSON.parse(reportText));

  return {
    corpus,
    corpusHash,
    rawRecords: rawReport.records,
    report: reportSchema.parse(rawReport),
    tiers,
  };
}

test('it records each scheduled request once, in schedule order, from the frozen corpus and one model', async () => {
  const ctx = await setupTest();

  expect(ctx.report.corpusHash).toBe(ctx.corpusHash);

  const expected = ctx.corpus.actions.flatMap((action) =>
    ctx.corpus.cells[action.label].flatMap((entry) =>
      Array.from(
        { length: 10 },
        (_, index) => `${action.id} ${entry.id} ${entry.expected} ${index + 1}`,
      ),
    ),
  );

  const recorded = ctx.report.records.map(
    (record) => `${record.action} ${record.cell} ${record.expected} ${record.repeat}`,
  );

  expect(recorded.toSorted()).toStrictEqual(expected.toSorted());

  expect(ctx.report.records.map((record) => record.index)).toStrictEqual(
    Array.from({ length: 760 }, (_, index) => index),
  );

  for (const record of ctx.report.records.filter((entry) => entry.status !== 'failure')) {
    expect(record.model).toBe(ctx.report.model);
  }
});

test('it ends a segment at each failure and never resends a failed request', async () => {
  const ctx = await setupTest();

  const failures = ctx.report.records.filter((record) => record.status === 'failure');

  expect(failures.map((record) => record.index)).toStrictEqual(
    ctx.report.segments
      .filter((segment) => segment.stoppedEarly === 'failure')
      .map((segment) => segment.lastIndex),
  );

  for (const [index, segment] of ctx.report.segments.entries()) {
    const next = ctx.report.segments[index + 1];

    expect(next === undefined || next.firstIndex > segment.lastIndex).toBeTrue();
  }
});

test('it varies only the message part within each action', async () => {
  const ctx = await setupTest();

  for (const action of ctx.corpus.actions) {
    const records = ctx.report.records.filter((record) => record.action === action.id);
    const absent = records.find((record) => record.cell === 'absent');
    const control = ctx.report.controlHashes[action.id];

    invariant(
      absent !== undefined && control !== undefined,
      'every action has an absent cell and a control hash',
    );

    expect(new Set(records.map((record) => record.controlHash))).toStrictEqual(new Set([control]));
    expect(absent.requestHash).toBe(absent.controlHash);

    for (const record of records) {
      const twins = records.filter((other) => other.cell === record.cell);

      expect(new Set(twins.map((twin) => twin.requestHash)).size).toBe(1);

      if (record.presentation === 'mark') {
        expect(record.requestHash).not.toBe(absent.requestHash);
      }
    }
  }
});

test('it sends the keep cell and the current control as one identical request', async () => {
  const ctx = await setupTest();

  for (const action of ctx.corpus.actions.filter((entry) => entry.label === 'risky')) {
    const hashes = new Map(
      ctx.report.records
        .filter((record) => record.action === action.id)
        .map((record) => [record.cell, record.requestHash]),
    );

    expect(hashes.get('keep-stale-same-consent')).toBe(hashes.get('current-consent'));
    expect(hashes.get('keep-stale-refusal')).toBe(hashes.get('current-refusal'));
    expect(hashes.get('mark-stale-same-consent')).not.toBe(hashes.get('current-consent'));
  }
});

test('it reproduces every recorded verdict from the recorded answers at the unchanged threshold', async () => {
  const ctx = await setupTest();

  for (const record of ctx.report.records.filter((entry) => entry.status !== 'failure')) {
    const rules: Record<string, DecisionRule> = {};
    const answers: Record<string, DecisionResult['answers'][string]> = {};

    for (const [key, [choice, confidence, allow, block, ask]] of Object.entries(record.answers)) {
      const configured = /^(?<category>hard_deny|soft_deny)_(?<index>\d+)$/u.exec(key);
      const category = configured?.groups?.['category'];
      const index = configured?.groups?.['index'];

      rules[key] =
        category === undefined || index === undefined
          ? { name: key, tier: ctx.tiers.get(key) ?? 'soft', source: 'shipped', text: '' }
          : {
              name: `Configured ${category} ${Number(index) + 1}`,
              tier: category === 'hard_deny' ? 'hard' : 'soft',
              source: 'configured',
              text: '',
            };

      answers[key] = { type: 'choice', choice, confidence, probabilities: { allow, block, ask } };
    }

    const request: DecisionRequest = {
      state: {
        policy: '',
        answerGuidance: '',
        rulesSource: 'shipped',
        configuredRules: { environment: [], allow: [], soft_deny: [], hard_deny: [] },
        lastUserMessage: null,
        action: { tool: 'Bash', cwd: '/repo', input: {} },
      },
      questions: {},
      rules,
    };

    const verdict = pickEvaluationVerdict(
      request,
      { model: record.model, answers, inputTokens: 0, requestBytes: 0 },
      0.8,
    );

    const gatingRule = ctx.corpus.actions.find((action) => action.id === record.action)?.gatingRule;

    expect([
      record.index,
      verdict.kind,
      verdict.kind === 'deny' ? verdict.rule : null,
      record.gating,
    ]).toStrictEqual([
      record.index,
      record.status,
      record.rule,
      gatingRule === undefined ? null : (record.answers[gatingRule] ?? null),
    ]);
  }
});

test('it derives the recorded summary from the recorded answers', async () => {
  const ctx = await setupTest();

  expect(ctx.report.summary).toStrictEqual(buildRelayConsentSummary(ctx.rawRecords));
});
