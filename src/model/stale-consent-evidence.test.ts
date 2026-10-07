import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import invariant from 'tiny-invariant';
import * as z from 'zod';
import { loadPolicy } from '../policy/load-policy.ts';
import { buildDecisionRequest } from './build-decision-request.ts';
import { pickDecisionVerdict } from './pick-decision-verdict.ts';
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

  const record = z.object({
    pair: z.number().int(),
    action: z.enum(['push', 'pr-create', 'comment']),
    variant: z.enum(['unrelated-topic', 'earlier-consent']),
    arm: z.enum(['stale', 'null']),
    requestHash: z.string(),
    controlHash: z.string(),
    model: z.string(),
    status: z.enum(['allow', 'ask', 'deny']),
    rule: z.string().nullable(),
    elapsedMs: z.number().int(),
    answers: z.record(z.string(), answer),
  });

  const report = z.object({
    model: z.string(),
    threshold: z.literal(0.8),
    samplesPerCase: z.literal(1),
    retries: z.literal(0),
    completedAt: z.string(),
    corpusHash: z.string(),
    records: z.array(record).length(12),
  });

  const [reportText, corpusText, policy] = await Promise.all([
    readFile(resolve(root, 'docs/evaluations/stale-consent.json'), 'utf8'),
    readFile(resolve(root, 'fixtures/stale-consent/cases.json'), 'utf8'),
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

  const corpusPair = z.object({
    pair: z.number().int(),
    action: z.enum(['push', 'pr-create', 'comment']),
    variant: z.enum(['unrelated-topic', 'earlier-consent']),
    firstArm: z.enum(['stale', 'null']),
  });

  const corpus = z.object({ pairs: z.array(corpusPair) }).parse(JSON.parse(corpusText));

  const corpusHash = createHash('sha256')
    .update(JSON.stringify(JSON.parse(corpusText)))
    .digest('hex');

  return {
    corpus,
    corpusHash,
    report: report.parse(JSON.parse(reportText)),
    tiers,
  };
}

test('it records one answer per arm of every corpus pair in the corpus order', async () => {
  const ctx = await setupTest();

  expect(ctx.report.corpusHash).toBe(ctx.corpusHash);

  expect(
    ctx.report.records.map(
      (record) => `${record.pair} ${record.action} ${record.variant} ${record.arm}`,
    ),
  ).toStrictEqual(
    ctx.corpus.pairs.flatMap((entry) =>
      (entry.firstArm === 'stale' ? ['stale', 'null'] : ['null', 'stale']).map(
        (arm) => `${entry.pair} ${entry.action} ${entry.variant} ${arm}`,
      ),
    ),
  );

  for (const record of ctx.report.records) {
    expect(record.model).toBe(ctx.report.model);
  }
});

test('it varies only the direct user message within each pair', async () => {
  const ctx = await setupTest();

  for (const entry of ctx.corpus.pairs) {
    const arms = ctx.report.records.filter((record) => record.pair === entry.pair);
    const stale = arms.find((record) => record.arm === 'stale');
    const empty = arms.find((record) => record.arm === 'null');

    invariant(stale && empty, 'each pair has both arms');

    expect(stale.controlHash).toBe(empty.controlHash);
    expect(stale.requestHash).not.toBe(empty.requestHash);
    expect(empty.requestHash).toBe(empty.controlHash);
  }
});

test('it reproduces every recorded verdict from the recorded answers at the unchanged threshold', async () => {
  const ctx = await setupTest();

  for (const record of ctx.report.records) {
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

    const verdict = pickDecisionVerdict(
      request,
      { model: record.model, answers, inputTokens: 0, requestBytes: 0 },
      0.8,
    );

    expect([
      record.pair,
      record.arm,
      verdict.kind,
      verdict.kind === 'deny' ? verdict.rule : null,
    ]).toStrictEqual([record.pair, record.arm, record.status, record.rule]);
  }
});
