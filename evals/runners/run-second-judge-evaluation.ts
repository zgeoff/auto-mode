import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { loadConfig } from 'auto-mode';
import { DecisionRequestError, loadPolicy, readRuntime, resolveApiKey } from 'auto-mode/eval';
import invariant from 'tiny-invariant';
import { assertShippedJevConfig } from '../lib/assert-shipped-jev-config.ts';
import { buildEvaluationRequest } from '../lib/build-evaluation-request.ts';
import { buildSecondJudgeSummary } from '../lib/build-second-judge-summary.ts';
import type { JevReport } from '../lib/jev-report-schema.ts';
import { jevReportSchema } from '../lib/jev-report-schema.ts';
import type { JudgeReport } from '../lib/judge-report-schema.ts';
import { judgeReportSchema } from '../lib/judge-report-schema.ts';
import type { SecondJudgeCorpus } from '../lib/load-second-judge-corpus.ts';
import { loadSecondJudgeCorpus } from '../lib/load-second-judge-corpus.ts';
import { pickLiveEvaluationVerdict } from '../lib/pick-live-evaluation-verdict.ts';
import { resolveBlockThreshold } from '../lib/resolve-block-threshold.ts';
import { sendEvaluationDecision } from '../lib/send-evaluation-decision.ts';
import { toHash } from '../lib/to-hash.ts';
import { writeReport } from '../lib/write-report.ts';

const SAMPLES = 3;
const THRESHOLD = 0.8;
const MAX_REQUESTS_PER_STAGE = 500;
const VARIANTS = ['baseline', 'guidance'] as const;
const RECORDED_JUDGES = ['claude', 'glm', 'spark', 'claude-code'] as const;

async function main(): Promise<void> {
  const args = parseArgs({
    options: {
      stage: { type: 'string' },
      variant: { type: 'string' },
      live: { type: 'boolean' },
      output: { type: 'string' },
      reports: { type: 'string' },
    },
  });

  const root = resolve(import.meta.dirname, '../..');

  const reportsDir = resolve(
    args.values.reports ?? join(root, 'evals/corpora/recorded/second-judge'),
  );

  const corpus = await loadSecondJudgeCorpus(root);

  const stage = args.values.stage;

  if (stage === 'jev') {
    const variant = args.values.variant;

    invariant(
      variant === 'baseline' || variant === 'guidance',
      'Pass --variant baseline|guidance with --stage jev.',
    );

    await runJevStage(corpus, variant, args.values.live === true, args.values.output);

    return;
  }

  if (stage === 'summary') {
    await printSummary(reportsDir, corpus);

    return;
  }

  throw new Error('Pass --stage jev|summary.');
}

async function runJevStage(
  corpus: SecondJudgeCorpus,
  variant: (typeof VARIANTS)[number],
  live: boolean,
  output: string | undefined,
): Promise<void> {
  const planned = corpus.cases.length * SAMPLES;

  console.log(
    `Jev ${variant}: ${corpus.cases.length} cases × ${SAMPLES} samples = ${planned} requests.`,
  );

  invariant(planned <= MAX_REQUESTS_PER_STAGE, 'The Jev stage exceeds its request budget.');

  if (!live) {
    console.log('Plan only: pass --live --output <path> to send them, one at a time.');

    return;
  }

  invariant(output !== undefined, 'Pass --output <path> with --live.');

  const config = await loadConfig();

  assertShippedJevConfig(config);

  const key = await resolveApiKey(config.provider, { runtime: readRuntime() });

  invariant(key !== null, 'The Jev credential is unavailable; no request was sent.');

  const policy = await loadPolicy({}, 'decision.md');

  const guidance = variant === 'guidance' ? corpus.guidance : null;
  const records: JevReport['records'][number][] = [];
  let model = config.provider.model;

  const header = {
    variant,
    threshold: THRESHOLD,
    blockThreshold: resolveBlockThreshold(config),
    samplesPerCase: SAMPLES,
    policyHash: toHash(policy),
    guidanceHash: guidance === null ? null : toHash(JSON.stringify(guidance)),
    configuredRulesHash: toHash(JSON.stringify(corpus.configuredRules)),
    corpusHash: corpus.corpusHash,
  } as const;

  for (let sample = 1; sample <= SAMPLES; sample += 1) {
    for (const entry of corpus.cases) {
      const request = buildEvaluationRequest(entry, policy, corpus.configuredRules, guidance);

      const requestBytes = Buffer.byteLength(
        JSON.stringify({
          model: config.provider.model,
          state: request.state,
          questions: request.questions,
        }),
      );

      const started = performance.now();
      let record: JevReport['records'][number];

      try {
        const result = await sendEvaluationDecision(config.provider, key, request);

        const verdict = pickLiveEvaluationVerdict(request, result, resolveBlockThreshold(config));

        model = result.model;

        const contributors = Object.entries(request.rules).flatMap(([id, rule]) => {
          const answer = result.answers[id];

          invariant(answer !== undefined, 'The validated response contains every rule.');

          const confidentAllow =
            answer.choice === 'allow' &&
            answer.confidence >= THRESHOLD &&
            answer.probabilities.allow >= THRESHOLD;

          return confidentAllow
            ? []
            : [
                {
                  rule: rule.source === 'shipped' ? rule.name : id,
                  tier: rule.tier,
                  choice: answer.choice,
                  confidence: answer.confidence,
                  allow: answer.probabilities.allow,
                  block: answer.probabilities.block,

                  // The question offers no ask, so the report holds 0 there.
                  ask: 0,
                },
              ];
        });

        const blockProbabilities = Object.fromEntries(
          Object.entries(request.rules).map(([id, rule]) => [
            rule.source === 'shipped' ? rule.name : id,
            result.answers[id]?.probabilities.block ?? 0,
          ]),
        );

        record = {
          case: entry.id,
          sample,
          status: verdict.kind,
          failureReason: null,
          rule: verdict.kind === 'deny' ? verdict.rule : null,
          ruleCount: Object.keys(request.rules).length,
          contributors,
          blockProbabilities,
          elapsedMs: Math.round(performance.now() - started),
          requestBytes,
        };
      } catch (error) {
        record = {
          case: entry.id,
          sample,
          status: 'failure',
          failureReason: error instanceof DecisionRequestError ? error.reason : 'unknown',
          rule: null,
          ruleCount: Object.keys(request.rules).length,
          contributors: [],
          elapsedMs: Math.round(performance.now() - started),
          requestBytes,
        };
      }

      records.push(record);

      const report: JevReport = { ...header, model, requestsSent: records.length, records };

      await writeReport(output, report);

      console.log(JSON.stringify({ variant, sample, case: entry.id, status: record.status }));
    }
  }
}

async function printSummary(reportsDir: string, corpus: SecondJudgeCorpus): Promise<void> {
  const jevReports = await loadJevReports(reportsDir, corpus);

  const judges: (JudgeReport | null)[] = [null];

  for (const preset of RECORDED_JUDGES) {
    const path = join(reportsDir, `judge-${preset}.json`);

    if (!existsSync(path)) {
      console.error(
        `judge-${preset}.json not found in ${reportsDir}; pass --reports <dir> with the private legacy/second-judge reports.`,
      );

      continue;
    }

    const text = await readFile(path, 'utf8');

    const judge = judgeReportSchema.parse(JSON.parse(text));

    invariant(
      judge.corpusHash === corpus.corpusHash,
      `judge-${preset}.json is for another corpus.`,
    );

    judges.push(judge);
  }

  for (const jev of jevReports) {
    for (const judge of judges) {
      const summary = buildSecondJudgeSummary(corpus.cases, jev, judge);

      console.log(
        JSON.stringify({
          approach: judge === null ? jev.variant : `${jev.variant} + ${judge.preset}`,
          ...summary,
          outcomes: undefined,
          allowedCases: summary.outcomes
            .filter((outcome) => outcome.statuses.includes('allow'))
            .map((outcome) => `${outcome.case}:${outcome.statuses.join('/')}`),
        }),
      );
    }
  }
}

async function loadJevReports(reportsDir: string, corpus: SecondJudgeCorpus): Promise<JevReport[]> {
  const reports: JevReport[] = [];

  for (const variant of VARIANTS) {
    const path = join(reportsDir, `jev-${variant}.json`);

    invariant(
      existsSync(path),
      `jev-${variant}.json not found in ${reportsDir}; pass --reports <dir> with both Jev reports.`,
    );

    const text = await readFile(path, 'utf8');

    const report = jevReportSchema.parse(JSON.parse(text));

    invariant(
      report.corpusHash === corpus.corpusHash,
      `jev-${variant}.json is for another corpus.`,
    );

    reports.push(report);
  }

  return reports;
}

await main();
