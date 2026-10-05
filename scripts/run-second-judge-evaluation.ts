import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import invariant from 'tiny-invariant';
import { PRESETS, loadConfig, resolveApiKey } from '../src/config/config.ts';
import { buildEvaluationPayload } from '../src/evaluation/build-evaluation-payload.ts';
import { buildEvaluationRequest } from '../src/evaluation/build-evaluation-request.ts';
import { buildSecondJudgeSummary } from '../src/evaluation/build-second-judge-summary.ts';
import type { JevReport } from '../src/evaluation/jev-report-schema.ts';
import { jevReportSchema } from '../src/evaluation/jev-report-schema.ts';
import type { JudgeReport } from '../src/evaluation/judge-report-schema.ts';
import { judgeReportSchema } from '../src/evaluation/judge-report-schema.ts';
import type { SecondJudgeCorpus } from '../src/evaluation/load-second-judge-corpus.ts';
import { loadSecondJudgeCorpus } from '../src/evaluation/load-second-judge-corpus.ts';
import { sendMessage } from '../src/model/anthropic-client.ts';
import { buildUserMessage } from '../src/model/build-request.ts';
import { DecisionRequestError } from '../src/model/decision-request-error.ts';
import { formatClassifierNote } from '../src/model/format-classifier-note.ts';
import { parseJudgeVerdict } from '../src/model/parse-judge-verdict.ts';
import { pickDecisionVerdict } from '../src/model/pick-decision-verdict.ts';
import { sendDecision } from '../src/model/send-decision.ts';
import { loadPolicy } from '../src/policy/load-policy.ts';

const SAMPLES = 3;
const THRESHOLD = 0.8;

// GEO-78 allows 1,000 requests per model family; two stages share each budget.
const MAX_REQUESTS_PER_STAGE = 500;
const VARIANTS = ['baseline', 'guidance'] as const;

async function main(): Promise<void> {
  const args = parseArgs({
    options: {
      stage: { type: 'string' },
      variant: { type: 'string' },
      preset: { type: 'string' },
      live: { type: 'boolean' },
      output: { type: 'string' },
    },
  });

  const root = resolve(import.meta.dirname, '..');

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

  if (stage === 'judge') {
    await runJudgeStage(
      root,
      corpus,
      args.values.preset,
      args.values.live === true,
      args.values.output,
    );

    return;
  }

  if (stage === 'summary') {
    await printSummary(root, corpus);

    return;
  }

  throw new Error('Pass --stage jev|judge|summary.');
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

  invariant(
    config.provider.protocol === 'system-one' &&
      config.rulesPath === undefined &&
      config.classifierPath === undefined,
    'Evaluate the shipped Jev policy with no replacement policy.',
  );

  invariant((config.minConfidence ?? THRESHOLD) === THRESHOLD, 'Keep the threshold at 0.8.');

  const key = await resolveApiKey(config.provider);

  invariant(key !== null, 'The Jev credential is unavailable; no request was sent.');

  const policy = await loadPolicy({}, 'decision.md');

  const guidance = variant === 'guidance' ? corpus.guidance : null;
  const records: JevReport['records'][number][] = [];
  let model = config.provider.model;

  const header = {
    variant,
    threshold: THRESHOLD,
    samplesPerCase: SAMPLES,
    policyHash: toHash(policy),
    guidanceHash: guidance === null ? null : toHash(JSON.stringify(guidance)),
    configuredRulesHash: toHash(JSON.stringify(corpus.configuredRules)),
    corpusHash: corpus.corpusHash,
  } as const;

  // Sample-major order spreads each case's samples across the run.
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
        const result = await sendDecision(config.provider, key, request);

        const verdict = pickDecisionVerdict(request, result, THRESHOLD);

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
                  ask: answer.probabilities.ask,
                },
              ];
        });

        record = {
          case: entry.id,
          sample,
          status: verdict.kind,
          failureReason: null,
          rule: verdict.kind === 'deny' ? verdict.rule : null,
          ruleCount: Object.keys(request.rules).length,
          contributors,
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

      await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);

      console.log(JSON.stringify({ variant, sample, case: entry.id, status: record.status }));
    }
  }
}

async function runJudgeStage(
  root: string,
  corpus: SecondJudgeCorpus,
  presetName: string | undefined,
  live: boolean,
  output: string | undefined,
): Promise<void> {
  const provider = presetName === undefined ? undefined : PRESETS[presetName];

  invariant(
    presetName !== undefined && provider !== undefined && provider.protocol !== 'system-one',
    'Pass --preset with one Messages API preset: claude, glm, or spark.',
  );

  const jevReports = await loadJevReports(root, corpus);

  const eligible = new Set<string>();

  for (const report of jevReports) {
    const summary = buildSecondJudgeSummary(corpus.cases, report, null);

    for (const outcome of summary.outcomes) {
      if (outcome.eligible.includes(true)) {
        eligible.add(outcome.case);
      }
    }
  }

  const cases = corpus.cases.filter((entry) => eligible.has(entry.id));
  const planned = cases.length * SAMPLES;

  console.log(
    `Judge ${presetName}: ${cases.length} eligible cases from ${jevReports.map((report) => report.variant).join(' + ')} × ${SAMPLES} samples = ${planned} requests.`,
  );

  invariant(planned <= MAX_REQUESTS_PER_STAGE, 'The judge stage exceeds its request budget.');

  if (!live) {
    console.log('Plan only: pass --live --output <path> to send them, one at a time, no retries.');

    return;
  }

  invariant(output !== undefined, 'Pass --output <path> with --live.');

  const key = await resolveApiKey(provider);

  invariant(key !== null, `The ${presetName} preset has no configured key; no request was sent.`);

  const system = await loadPolicy({}, 'classifier.md');

  const records: JudgeReport['records'][number][] = [];

  const header = {
    preset: presetName,
    model: provider.model,
    samplesPerCase: SAMPLES,
    policyHash: toHash(system),
    corpusHash: corpus.corpusHash,
    eligibleFrom: jevReports.map((item) => item.variant),
  } as const;

  for (let sample = 1; sample <= SAMPLES; sample += 1) {
    for (const entry of cases) {
      const user = buildUserMessage(
        buildEvaluationPayload(entry),
        [{ role: 'user', text: entry.lastUserMessage }],
        provider.reasoning,
      );

      const started = performance.now();
      let record: JudgeReport['records'][number];

      try {
        const reply = await sendMessage(provider, key, { system, user });

        const text = formatClassifierNote(reply.text, key);
        const verdict = parseJudgeVerdict(text);

        record = {
          case: entry.id,
          sample,
          verdict: verdict.kind,
          rule: verdict.kind === 'block' ? verdict.rule : null,
          failureReason: null,
          elapsedMs: Math.round(performance.now() - started),
          outputTokens: reply.outputTokens,
          tail: text.slice(-600),
        };
      } catch (error) {
        record = {
          case: entry.id,
          sample,
          verdict: 'failure',
          rule: null,
          failureReason:
            error instanceof Error && error.name === 'AbortError' ? 'timeout' : 'request',
          elapsedMs: Math.round(performance.now() - started),
          outputTokens: null,
          tail: null,
        };
      }

      records.push(record);

      const report: JudgeReport = { ...header, requestsSent: records.length, records };

      await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);

      console.log(
        JSON.stringify({ preset: presetName, sample, case: entry.id, verdict: record.verdict }),
      );
    }
  }
}

async function printSummary(root: string, corpus: SecondJudgeCorpus): Promise<void> {
  const jevReports = await loadJevReports(root, corpus);

  for (const jev of jevReports) {
    const judges: (JudgeReport | null)[] = [null];

    for (const preset of Object.keys(PRESETS)) {
      const path = join(root, `docs/evaluations/second-judge/judge-${preset}.json`);

      if (existsSync(path)) {
        const text = await readFile(path, 'utf8');

        judges.push(judgeReportSchema.parse(JSON.parse(text)));
      }
    }

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

async function loadJevReports(root: string, corpus: SecondJudgeCorpus): Promise<JevReport[]> {
  const reports: JevReport[] = [];

  for (const variant of VARIANTS) {
    const path = join(root, `docs/evaluations/second-judge/jev-${variant}.json`);

    if (!existsSync(path)) {
      continue;
    }

    const text = await readFile(path, 'utf8');

    const report = jevReportSchema.parse(JSON.parse(text));

    invariant(
      report.corpusHash === corpus.corpusHash,
      `jev-${variant}.json is for another corpus.`,
    );

    reports.push(report);
  }

  invariant(reports.length > 0, 'Run the Jev stage first.');

  return reports;
}

function toHash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

await main();
