import { resolve } from 'node:path';
import { loadConfig } from 'auto-mode';
import {
  loadClaudeRules,
  loadPolicy,
  readRuntime,
  resolveApiKey,
  sendDecision,
  sendJudgeMessage,
  startJudgeSession,
  toTimerDelay,
} from 'auto-mode/eval';
import type { JudgeSession } from 'auto-mode/eval';
import { experiments } from './experiments/index.ts';
import { assertShippedJevConfig } from './lib/assert-shipped-jev-config.ts';
import { readPublicCommit } from './lib/read-public-commit.ts';
import { runEvalCommand } from './lib/run-eval-command.ts';
import { sendEvaluationDecision } from './lib/send-evaluation-decision.ts';

async function main(): Promise<void> {
  const repoRoot = resolve(import.meta.dirname, '..');
  const runtime = readRuntime();
  const host = runtime.host;

  // One run holds one judge session, as an agent session holds one judge
  // server, so the run measures the warm process the mod reaches.
  let judgeSession: JudgeSession | undefined;

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
        return { ...base, judgeModel: null, send: null, sendWithChoices: null, sendJudge: null };
      }

      assertShippedJevConfig(config);

      // A run that replays Jev and sends only the judge needs no Jev credential,
      // so the key resolves on the first Jev request.
      let pendingKey: Promise<string | null> | null = null;

      const requireKey = async (): Promise<string> => {
        pendingKey ??= resolveApiKey(config.provider, { runtime });

        const key = await pendingKey;

        if (key === null) {
          throw new Error('The configured evaluation credential is unavailable.');
        }

        return key;
      };

      const configured = config.judge ?? null;

      const judge =
        configured === null || judgeModel === null
          ? configured
          : { ...configured, model: judgeModel };

      const judgeKey =
        judge === null || judge.protocol === 'claude-code'
          ? null
          : await resolveApiKey(judge, { runtime });

      if (judge?.protocol === 'claude-code') {
        judgeSession ??= startJudgeSession(host.env);
      }

      return {
        ...base,
        judgeModel: judge?.model ?? null,
        send: async (request) => {
          const key = await requireKey();

          return sendEvaluationDecision(config.provider, key, request);
        },
        sendWithChoices: async (request, choices) => {
          const key = await requireKey();

          return sendDecision<string>(config.provider, key, request, {
            signal: AbortSignal.timeout(toTimerDelay(config.provider.timeoutMs)),
            fetch: runtime.fetch,
            choices,
          });
        },
        sendJudge:
          judge === null || (judge.protocol !== 'claude-code' && judgeKey === null)
            ? null
            : async (request) => {
                const reply = await sendJudgeMessage(
                  judge,
                  { system: judgePolicy, user: request.user },
                  { apiKey: judgeKey, env: host.env, session: judgeSession },
                  AbortSignal.timeout(toTimerDelay(judge.timeoutMs)),
                );

                return { model: reply.model, text: reply.text, fallback: reply.fallback };
              },
      };
    },
  });

  judgeSession?.stop();
}

await main();
