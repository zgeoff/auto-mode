import { resolve } from 'node:path';
import { loadClaudeRules, loadConfig, loadPolicy, resolveApiKey } from 'auto-mode';
import { readHostEnvironment } from 'auto-mode/eval';
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

      const [policy, configuredRules] = await Promise.all([
        loadPolicy({}, 'decision.md'),
        loadClaudeRules(config.claudeSettingsPath, host),
      ]);

      if (!live) {
        return { publicCommit, policy, configuredRules, send: null };
      }

      assertShippedJevConfig(config);

      const key = await resolveApiKey(config.provider, { host });

      if (key === null) {
        throw new Error('The configured evaluation credential is unavailable.');
      }

      return {
        publicCommit,
        policy,
        configuredRules,
        send: (request) => sendEvaluationDecision(config.provider, key, request),
      };
    },
  });
}

await main();
