import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import invariant from 'tiny-invariant';
import * as z from 'zod';
import { loadConfig, resolveApiKey } from '../src/config/config.ts';
import { loadClaudeRules } from '../src/config/load-claude-rules.ts';
import { pickEvaluationVerdict } from '../src/evaluation/pick-evaluation-verdict.ts';
import { buildDecisionRequest } from '../src/model/build-decision-request.ts';
import { loadRepositoryContext } from '../src/model/load-repository-context.ts';
import { sendDecision } from '../src/model/send-decision.ts';
import { loadPolicy } from '../src/policy/load-policy.ts';

async function main(): Promise<void> {
  const args = parseArgs({
    options: { live: { type: 'boolean' }, phase: { type: 'string' }, output: { type: 'string' } },
  });

  const phase = args.values.phase;
  const output = args.values.output;

  invariant(
    args.values.live === true && (phase === 'before' || phase === 'after') && output !== undefined,
    'Pass --live --phase before|after --output <path>; this manual evaluation is never a test.',
  );

  const root = resolve(import.meta.dirname, '..');

  const corpusText = await readFile(join(root, 'fixtures/answer-guidance/cases.json'), 'utf8');

  const caseSchema = z.object({
    pair: z.number().int(),
    name: z.string(),
    kind: z.enum(['safe', 'risk']),
    tool: z.string(),
    input: z.record(z.string(), z.unknown()),
  });

  const corpus = z
    .object({ lastUserMessage: z.string(), cases: z.array(caseSchema).length(12) })
    .parse(JSON.parse(corpusText));

  const config = await loadConfig();

  invariant(
    config.provider.protocol === 'system-one' &&
      config.rulesPath === undefined &&
      config.classifierPath === undefined,
    'Evaluate the shipped Jev policy with no replacement policy.',
  );

  invariant((config.minConfidence ?? 0.8) === 0.8, 'Keep the configured threshold at 0.8.');

  const key = await resolveApiKey(config.provider);

  invariant(key !== null, 'The configured evaluation credential is unavailable.');

  const cwd = process.cwd();

  const repository = await loadRepositoryContext(cwd);
  const configuredRules = await loadClaudeRules(config.claudeSettingsPath);
  const policy = await loadPolicy({}, 'decision.md');

  const records: unknown[] = [];

  for (const entry of corpus.cases) {
    const input = { ...entry.input };
    const file = input['file_path'];

    if (typeof file === 'string' && !isAbsolute(file)) {
      input['file_path'] = join(cwd, file);
    }

    const command = input['command'];
    const hasGitCommand = typeof command === 'string' && /\bgit\s/u.test(command);
    const isFileEdit = entry.tool === 'Write' || entry.tool === 'Edit';
    const evidence = hasGitCommand || isFileEdit ? repository : null;

    const request = buildDecisionRequest(
      {
        sessionID: 'answer-guidance-evaluation',
        cwd,
        toolName: entry.tool,
        toolInput: input,
      },
      policy,
      configuredRules,
      corpus.lastUserMessage,
      'shipped',
      evidence,
    );

    const body = JSON.stringify({
      model: config.provider.model,
      state: request.state,
      questions: request.questions,
    });

    const base = {
      pair: entry.pair,
      case: entry.name,
      kind: entry.kind,
      requestBytes: Buffer.byteLength(body),
      requestHash: toHash(JSON.stringify(request)),
    };

    const started = performance.now();

    try {
      const result = await sendDecision(config.provider, key, request);

      const verdict = pickEvaluationVerdict(request, result, 0.8);

      const answers = Object.fromEntries(
        Object.entries(request.rules).map(([id, rule]) => {
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
        elapsedMs: Math.round(performance.now() - started),
        answers,
      });

      console.log(JSON.stringify({ phase, case: entry.name, status: verdict.kind }));
    } catch {
      records.push({
        ...base,
        status: 'failure',
        elapsedMs: Math.round(performance.now() - started),
        answers: null,
      });

      console.log(JSON.stringify({ phase, case: entry.name, status: 'failure' }));
    }
  }

  const report = {
    phase,
    model: config.provider.model,
    threshold: 0.8,
    samplesPerCase: 1,
    policyHash: toHash(policy),
    configuredRulesHash: toHash(JSON.stringify(configuredRules)),
    corpusHash: toHash(JSON.stringify(corpus)),
    records,
  };

  await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
}

function toHash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

await main();
