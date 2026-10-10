import { resolve } from 'node:path';
import { loadClaudeRules, loadConfig, loadPolicy, resolveApiKey, sendDecision } from 'auto-mode';
import {
  buildUserMessage,
  formatClassifierNote,
  readHostEnvironment,
  sendMessage,
  toTimerDelay,
} from 'auto-mode/eval';
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
    repoRoot,
    experiments,
    now: () => new Date(),
    prepareRun: async (live) => {
      const config = await loadConfig(undefined, host);

      const publicCommit = readPublicCommit(repoRoot, live);

      const [policy, judgePolicy, configuredRules] = await Promise.all([
        loadPolicy({}, 'decision.md'),
        loadPolicy({}, 'classifier.md'),
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

      const judge = config.judge ?? null;
      const judgeKey = judge === null ? null : await resolveApiKey(judge, { host });

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
          judge === null || judgeKey === null
            ? null
            : async (request) => {
                const transcript =
                  request.lastUserMessage === null
                    ? []
                    : [{ role: 'user' as const, text: request.lastUserMessage }];

                const user = buildUserMessage(
                  request.action,
                  transcript,
                  judge.reasoning,
                  request.repository,
                );

                const reply = await sendMessage(
                  judge,
                  judgeKey,
                  { system: judgePolicy, user },
                  AbortSignal.timeout(toTimerDelay(judge.timeoutMs)),
                );

                return { model: judge.model, text: formatClassifierNote(reply.text, judgeKey) };
              },
      };
    },
  });
}

await main();
