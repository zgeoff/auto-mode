#!/usr/bin/env node
import { randomUUID } from 'node:crypto';
import { text } from 'node:stream/consumers';
import { parseArgs } from 'node:util';
import { classifyAction } from './classify-action.ts';
import { buildJevOnlyConfig } from './config/build-jev-only-config.ts';
import { loadConfig } from './config/config.ts';
import { writeActionDiagnostic } from './diagnostics/write-action-diagnostic.ts';
import { loadPolicy } from './policy/load-policy.ts';
import { parseActionRequest } from './request/parse-action-request.ts';
import { renderVerdict } from './request/render-verdict.ts';
import type { Verdict } from './request/types.ts';

const USAGE = `auto-mode — a permission classifier for the auto-mode Claude Code mod

Usage:
  auto-mode run              Read an action request on stdin, write a verdict on stdout
  auto-mode print-prompt     Print the system prompt the classifier receives

Options:
  --classifier <path>   Use this framework file instead of the shipped one
  --rules <path>        Use this rule list instead of the shipped one
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

  const request = parseActionRequest(body);

  if (request === null) {
    return printNote(explain, 'not an action request this classifier judges, so no verdict');
  }

  const invocationID = randomUUID();

  await writeActionDiagnostic(request, { invocationID, status: 'started' });

  let loaded;

  try {
    loaded = await loadConfig();
  } catch {
    await writeActionDiagnostic(request, { invocationID, status: 'failure', verdict: 'defer' });

    return printNote(true, 'configuration unreadable; no verdict');
  }

  const config = jevOnly ? buildJevOnlyConfig(loaded) : loaded;

  if (config === null) {
    await writeActionDiagnostic(request, { invocationID, status: 'failure', verdict: 'defer' });

    return printNote(true, 'Jev-only evaluation requires system-one; no verdict');
  }

  const deadlineAt = deadline === undefined ? undefined : Number(deadline);

  if (
    deadlineAt !== undefined &&
    (!jevOnly || !Number.isSafeInteger(deadlineAt) || deadlineAt <= 0)
  ) {
    await writeActionDiagnostic(request, { invocationID, status: 'failure', verdict: 'defer' });

    return printNote(true, 'invalid Jev evaluation deadline; no verdict');
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
    const outcome = await classifyAction(request, config, {
      localOnly,
      deadlineAt,
      signal: controller.signal,
    });

    if (outcome.verdict !== null) {
      writeVerdict(outcome.verdict);
    }

    await writeActionDiagnostic(request, {
      invocationID,
      status: outcome.status,
      verdict: outcome.verdict?.kind ?? 'defer',
      ...(outcome.diagnostics === undefined ? {} : { diagnostics: outcome.diagnostics }),
    });

    return printNote(explain || outcome.unavailable === true, outcome.note);
  } finally {
    process.off('SIGTERM', stopEvaluation);
    process.off('SIGINT', stopEvaluation);
  }
}

function writeVerdict(verdict: Verdict): void {
  process.stdout.write(renderVerdict(verdict));
}

function printNote(explain: boolean, message: string): number {
  if (explain) {
    process.stderr.write(`auto-mode: ${message}\n`);
  }

  return 0;
}

async function main(argv: readonly string[]): Promise<number> {
  const args = parseArgs({
    args: [...argv],
    allowPositionals: true,
    options: {
      classifier: { type: 'string' },
      rules: { type: 'string' },
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
      process.stderr.write('auto-mode: configuration unreadable; no verdict\n');

      return 0;
    }
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
