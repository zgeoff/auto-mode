import { resolve } from 'node:path';
import { loadClaudeRules, loadConfig, loadPolicy, resolveApiKey, sendDecision } from 'auto-mode';
import { readHostEnvironment, sendJudgeMessage, toTimerDelay } from 'auto-mode/eval';
import { experiments } from './experiments/index.ts';
import { assertShippedJevConfig } from './lib/assert-shipped-jev-config.ts';
import { readPublicCommit } from './lib/read-public-commit.ts';
import { runEvalCommand } from './lib/run-eval-command.ts';
import { sendEvaluationDecision } from './lib/send-evaluation-decision.ts';

async function main(): Promise<void> {
  const repoRoot = resolve(import.meta.dirname, '..');
  const host = readHostEnvironment();

  process.exitCode = await runEvalCommand(process.argv.slice(2), {
    stdout: (text) => process.stdout.write(text),
    stderr: (text) => process.stderr.write(text),
    env: host.env,
    home: host.home,
    repoRoot,
    experiments,
    now: () => new Date(),
    prepareRun: async (live, judgeModel) => {
      const config = await loadConfig(undefined, host);

      const publicCommit = readPublicCommit(repoRoot, live);

      const [policy, judgePolicy, configuredRules] = await Promise.all([
        loadPolicy({}, 'decision.md'),
        loadPolicy({}, 'judge.md'),
        loadClaudeRules(config.claudeSettingsPath, host),
      ]);

      const base = {
        publicCommit: publicCommit.commit,
        dirtyTree: publicCommit.dirty,
        policy,
        judgePolicy,
        configuredRules,
      };

      if (!live) {
        return { ...base, send: null, sendWithChoices: null, sendJudge: null };
      }

      assertShippedJevConfig(config);

      const key = await resolveApiKey(config.provider, { host });

      if (key === null) {
        throw new Error('The configured evaluation credential is unavailable.');
      }

      const configured = config.judge ?? null;

      const judge =
        configured === null || judgeModel === null
          ? configured
          : { ...configured, model: judgeModel };

      const judgeKey =
        judge === null || judge.protocol === 'claude-code'
          ? null
          : await resolveApiKey(judge, { host });

      return {
        ...base,
        send: (request) => sendEvaluationDecision(config.provider, key, request),
        sendWithChoices: (request, choices) =>
          sendDecision<string>(
            config.provider,
            key,
            request,
            AbortSignal.timeout(toTimerDelay(config.provider.timeoutMs)),
            { choices },
          ),
        sendJudge:
          judge === null || (judge.protocol !== 'claude-code' && judgeKey === null)
            ? null
            : async (request) => {
                const text = await sendJudgeMessage(
                  judge,
                  { system: judgePolicy, user: request.user },
                  { apiKey: judgeKey, env: host.env },
                  AbortSignal.timeout(toTimerDelay(judge.timeoutMs)),
                );

                return { model: judge.model, text };
              },
      };
    },
  });
}

await main();
