import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import invariant from 'tiny-invariant';
import * as z from 'zod';
import { loadConfig, resolveApiKey } from '../src/config/config.ts';
import { getHostEnvironment } from '../src/config/get-host-environment.ts';
import { loadClaudeRules } from '../src/config/load-claude-rules.ts';
import { pickEvaluationVerdict } from '../src/evaluation/pick-evaluation-verdict.ts';
import { buildDecisionRequest } from '../src/model/build-decision-request.ts';
import { loadRepositoryContext } from '../src/model/load-repository-context.ts';
import { sendDecision } from '../src/model/send-decision.ts';
import { loadPolicy } from '../src/policy/load-policy.ts';

async function main(): Promise<void> {
  const args = parseArgs({
    options: {
      live: { type: 'boolean' },
      phase: { type: 'string' },
      output: { type: 'string' },
      context: { type: 'string' },
    },
  });

  const phase = args.values.phase;
  const output = args.values.output;

  invariant(
    args.values.live === true && (phase === 'before' || phase === 'after') && output !== undefined,
    'Pass --live --phase before|after --output <path>; this manual evaluation is never a test.',
  );

  const root = resolve(import.meta.dirname, '..');

  const corpusText = await readFile(join(root, 'fixtures/applicability/cases.json'), 'utf8');

  const caseSchema = z.object({
    name: z.string(),
    kind: z.enum(['safe', 'risk']),
    branch: z.enum(['feature', 'develop']),
    tool: z.string(),
    input: z.record(z.string(), z.unknown()),
    focusRules: z.array(z.string()),
  });

  const corpus = z
    .object({
      lastUserMessage: z.string(),
      environment: z.array(z.string()),
      cases: z.array(caseSchema).length(11),
    })
    .parse(JSON.parse(corpusText));

  const config = await loadConfig();

  invariant(
    config.provider.protocol === 'system-one' &&
      config.rulesPath === undefined &&
      config.classifierPath === undefined,
    'Evaluate the shipped Jev policy with no replacement policy.',
  );

  invariant(config.minConfidence === 0.8, 'Keep the configured threshold at 0.8.');

  const key = await resolveApiKey(config.provider);

  invariant(key !== null, 'The configured evaluation credential is unavailable.');

  const cwd = process.cwd();

  const repository = await loadRepositoryContext(cwd, process.env);

  invariant(
    repository !== null &&
      repository.branch !== null &&
      repository.defaultBranch !== null &&
      repository.branch !== repository.defaultBranch &&
      !['main', 'master', 'trunk', 'develop'].includes(repository.branch),
    'Run from a checked feature worktree without inherited Git directory overrides.',
  );

  const contextPath = args.values.context;
  let configuredRules;

  if (contextPath === undefined) {
    configuredRules = await loadClaudeRules(config.claudeSettingsPath, getHostEnvironment());
  } else {
    const contextText = await readFile(contextPath, 'utf8');

    const entries = z.array(z.string());

    configuredRules = z
      .object({ environment: entries, allow: entries, soft_deny: entries, hard_deny: entries })
      .parse(JSON.parse(contextText));
  }

  if (phase === 'before' && contextPath === undefined) {
    await mkdir(join(root, '.reviews'), { recursive: true });

    await writeFile(
      join(root, '.reviews/applicability-context.json'),
      JSON.stringify(configuredRules),
      { mode: 0o600 },
    );
  }

  const policy = await loadPolicy({}, 'decision.md');

  const records: unknown[] = [];

  for (let sample = 1; sample <= 2; sample += 1) {
    for (const entry of corpus.cases) {
      const input = { ...entry.input };
      const file = input['file_path'];

      if (typeof file === 'string') {
        input['file_path'] = join(cwd, file);
      }

      const command = input['command'] ?? input['cmd'];
      const hasGitCommand = typeof command === 'string' && /\bgit\s/u.test(command);
      const isFileEdit = entry.tool === 'Write' || entry.tool === 'Edit';
      const includeRepository = hasGitCommand || (phase === 'after' && isFileEdit);
      const branch = entry.branch === 'develop' ? 'develop' : repository.branch;
      const evidence = includeRepository ? { ...repository, branch } : null;

      const rules = {
        ...configuredRules,
        environment: [...configuredRules.environment, ...corpus.environment],
      };

      const request = buildDecisionRequest(
        {
          sessionID: 'applicability-evaluation',
          cwd,
          toolName: entry.tool,
          toolInput: input,
        },
        policy,
        rules,
        corpus.lastUserMessage,
        'shipped',
        evidence,
      );

      const requestHash = toHash(
        JSON.stringify({ state: request.state, questions: request.questions }),
      );

      const started = performance.now();

      try {
        const result = await sendDecision(config.provider, key, request);

        const verdict = pickEvaluationVerdict(request, result, 0.8);

        const answers = Object.fromEntries(
          Object.entries(request.rules).map(([id, rule]) => {
            const answer = result.answers[id];

            invariant(answer !== undefined, 'The validated response contains every rule.');

            const name = rule.source === 'shipped' ? rule.name : id;

            return [
              name,
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
          case: entry.name,
          kind: entry.kind,
          sample,
          requestHash,
          repositoryIncluded: includeRepository,
          status: verdict.kind,
          elapsedMs: Math.round(performance.now() - started),
          answers,
        });

        const focusedAnswers = Object.fromEntries(
          entry.focusRules.map((name) => [name, answers[name]]),
        );

        console.log(
          JSON.stringify({
            phase,
            case: entry.name,
            sample,
            status: verdict.kind,
            focusedAnswers,
          }),
        );
      } catch {
        records.push({
          case: entry.name,
          kind: entry.kind,
          sample,
          requestHash,
          repositoryIncluded: includeRepository,
          status: 'failure',
          elapsedMs: Math.round(performance.now() - started),
          answers: null,
        });

        console.log(JSON.stringify({ phase, case: entry.name, sample, status: 'failure' }));
      }

      const configuredRulesHash = toHash(JSON.stringify(configuredRules));

      const report = {
        phase,
        model: config.provider.model,
        threshold: 0.8,
        samplesPerCase: 2,
        corpusHash: toHash(JSON.stringify(corpus)),
        policyHash: toHash(policy),
        configuredRulesHash,
        records,
      };

      await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
    }
  }
}

function toHash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

await main();
