#!/usr/bin/env node
import { randomUUID } from 'node:crypto';
import { text } from 'node:stream/consumers';
import { parseArgs } from 'node:util';
import { buildJevOnlyConfig } from './config/build-jev-only-config.ts';
import { loadConfig, resolveConfigPath } from './config/config.ts';
import { loadClaudeRules } from './config/load-claude-rules.ts';
import { writeActionDiagnostic } from './diagnostics/write-action-diagnostic.ts';
import { parsePayload } from './harness/parse-payload.ts';
import { renderVerdict } from './harness/render-verdict.ts';
import type { HookEvent, Verdict } from './harness/types.ts';
import {
  EVENT_NOTES,
  SETTINGS_PATHS,
  SETUP_NOTES,
  buildHookConfig,
} from './install/hook-config.ts';
import { classifyWithModel } from './model/classify-with-model.ts';
import { loadPolicy } from './policy/load-policy.ts';
import { classifyLocally } from './rules/classify-locally.ts';

const USAGE = `auto-mode — a permission classifier that runs as a hook

Usage:
  auto-mode run              Read a hook payload on stdin, write a verdict on stdout
  auto-mode print-prompt     Print the system prompt the classifier receives
  auto-mode init <harness>   Print the hook entry to add: claude, codex or muse

Options:
  --classifier <path>   Use this framework file instead of the shipped one
  --rules <path>        Use this rule list instead of the shipped one
  --event <event>       With init: pre-tool-use, the default, or permission-request
  --explain             With run: also write the reasoning to stderr
  --local-only          With run: skip the model tier
  --jev-only            With run: require Jev and cap its API timeout at 5 seconds
  --evaluation-deadline <unix-ms>  With --jev-only: share the helper and API deadline
`;

function readStdin(): Promise<string> {
  return text(process.stdin);
}

async function run(
  explain: boolean,
  localOnly: boolean,
  jevOnly: boolean,
  deadline?: string,
): Promise<number> {
  const raw = await readStdin();

  let body: unknown;

  try {
    body = JSON.parse(raw);
  } catch {
    return printNote(explain, 'stdin is not JSON, so no verdict');
  }

  const payload = parsePayload(body);

  if (payload === null) {
    return printNote(explain, 'not a tool gate this hook judges, so no verdict');
  }

  const invocationID = randomUUID();

  await writeActionDiagnostic(payload, { invocationID, status: 'started' });

  let loaded;

  try {
    loaded = await loadConfig();
  } catch {
    await writeActionDiagnostic(payload, { invocationID, status: 'failure', verdict: 'defer' });

    return printNote(true, 'configuration unreadable; deferring to the harness');
  }

  const config = jevOnly ? buildJevOnlyConfig(loaded) : loaded;

  if (config === null) {
    await writeActionDiagnostic(payload, { invocationID, status: 'failure', verdict: 'defer' });

    return printNote(true, 'Jev-only evaluation requires system-one; deferring to the harness');
  }

  let configured = null;

  if (config.provider.protocol === 'system-one') {
    try {
      configured = await loadClaudeRules(config.claudeSettingsPath);
    } catch {
      if (config.onFailure === 'deny') {
        writeVerdict(payload.event, {
          kind: 'deny',
          rule: 'Classifier Unavailable',
          reason: 'Claude settings unreadable',
        });
      }

      await writeActionDiagnostic(payload, {
        invocationID,
        status: 'failure',
        verdict: config.onFailure === 'deny' ? 'deny' : 'defer',
      });

      return printNote(true, 'Claude settings unreadable; classifier unavailable');
    }
  }

  const local =
    configured !== null && (configured.hard_deny.length > 0 || configured.soft_deny.length > 0)
      ? { kind: 'escalate' as const }
      : classifyLocally(payload);

  if (local.kind === 'allow') {
    writeVerdict(payload.event, { kind: 'allow' });

    await writeActionDiagnostic(payload, { invocationID, status: 'allow', verdict: 'allow' });

    return printNote(explain, `allowed by ${local.exception} (${payload.harness}, local)`);
  }

  if (localOnly) {
    await writeActionDiagnostic(payload, { invocationID, status: 'skipped', verdict: 'defer' });

    return printNote(
      explain,
      `${payload.toolName} needs the model tier, which --local-only skipped`,
    );
  }

  const deadlineAt = deadline === undefined ? undefined : Number(deadline);

  if (
    deadlineAt !== undefined &&
    (!jevOnly || !Number.isSafeInteger(deadlineAt) || deadlineAt <= 0)
  ) {
    await writeActionDiagnostic(payload, { invocationID, status: 'failure', verdict: 'defer' });

    return printNote(true, 'invalid Jev evaluation deadline; deferring to the harness');
  }

  const controller = new AbortController();

  const stopEvaluation = () => {
    controller.abort();
  };

  if (jevOnly) {
    process.on('SIGTERM', stopEvaluation);
    process.on('SIGINT', stopEvaluation);
  }

  try {
    const outcome = await classifyWithModel(payload, config, {
      deadlineAt,
      signal: controller.signal,
    });

    if (outcome.verdict !== null) {
      writeVerdict(payload.event, outcome.verdict);
    }

    await writeActionDiagnostic(payload, {
      invocationID,
      status: outcome.diagnostics?.status ?? outcome.verdict?.kind ?? 'failure',
      verdict: outcome.verdict?.kind ?? 'defer',
      ...(outcome.diagnostics === undefined ? {} : { diagnostics: outcome.diagnostics }),
    });

    return printNote(explain || outcome.unavailable === true, outcome.note);
  } finally {
    process.off('SIGTERM', stopEvaluation);
    process.off('SIGINT', stopEvaluation);
  }
}

// An event that cannot carry the verdict renders nothing, and writing nothing
// is the answer: the harness falls back to asking.
function writeVerdict(event: HookEvent, verdict: Verdict): void {
  const rendered = renderVerdict(event, verdict);

  if (rendered !== null) {
    process.stdout.write(rendered);
  }
}

function printNote(explain: boolean, message: string): number {
  if (explain) {
    process.stderr.write(`auto-mode: ${message}\n`);
  }

  return 0;
}

// The names the operator types, kebab-cased, against the names the harnesses
// send on the wire.
const HOOK_EVENTS: Readonly<Record<string, HookEvent | undefined>> = {
  'pre-tool-use': 'PreToolUse',
  'permission-request': 'PermissionRequest',
};

async function main(argv: readonly string[]): Promise<number> {
  const args = parseArgs({
    args: [...argv],
    allowPositionals: true,
    options: {
      classifier: { type: 'string' },
      rules: { type: 'string' },
      event: { type: 'string' },
      explain: { type: 'boolean' },
      'local-only': { type: 'boolean' },
      'jev-only': { type: 'boolean' },
      'evaluation-deadline': { type: 'string' },
      help: { type: 'boolean', short: 'h' },
    },
  });

  const [command] = args.positionals;

  if (args.values.help === true || command === undefined) {
    process.stdout.write(USAGE);

    return 0;
  }

  if (command === 'run') {
    try {
      return await run(
        args.values.explain === true,
        args.values['local-only'] === true,
        args.values['jev-only'] === true,
        args.values['evaluation-deadline'],
      );
    } catch {
      process.stderr.write('auto-mode: configuration unreadable; deferring to the harness\n');

      return 0;
    }
  }

  if (command === 'init') {
    const [, harness] = args.positionals;

    if (harness !== 'claude' && harness !== 'codex' && harness !== 'muse') {
      process.stderr.write('auto-mode init: name a harness — claude, codex or muse\n');

      return 2;
    }

    const event = HOOK_EVENTS[args.values.event ?? 'pre-tool-use'];

    if (event === undefined) {
      process.stderr.write('auto-mode init: --event takes pre-tool-use or permission-request\n');

      return 2;
    }

    // Claude Code is the only harness that reports a permission request of its
    // own, so the entry would install and never fire anywhere else.
    if (event === 'PermissionRequest' && harness !== 'claude') {
      process.stderr.write(`auto-mode init: only Claude Code sends PermissionRequest\n`);

      return 2;
    }

    process.stdout.write(`# Add this to ${SETTINGS_PATHS[harness]}\n`);
    process.stdout.write(`# Configuration lives at ${resolveConfigPath()}\n`);

    process.stdout.write(
      `${buildHookConfig(harness, `${process.execPath} ${process.argv[1] ?? 'auto-mode'} run`, event)}\n`,
    );

    for (const line of [...SETUP_NOTES[harness], ...EVENT_NOTES[event]]) {
      process.stdout.write(`# ${line}\n`);
    }

    return 0;
  }

  if (command === 'print-prompt') {
    const config = await loadConfig();

    const framework = config.provider.protocol === 'system-one' ? 'decision.md' : 'classifier.md';

    const prompt = await loadPolicy(
      {
        classifierPath: args.values.classifier ?? config.classifierPath,
        rulesPath: args.values.rules ?? config.rulesPath,
      },
      framework,
    );

    process.stdout.write(`${prompt}\n`);

    return 0;
  }

  process.stderr.write(`auto-mode: unknown command '${command}'\n\n${USAGE}`);

  return 2;
}

process.exitCode = await main(process.argv.slice(2));
