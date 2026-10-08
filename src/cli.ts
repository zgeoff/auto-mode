#!/usr/bin/env node
import { randomUUID } from 'node:crypto';
import { homedir } from 'node:os';
import { text } from 'node:stream/consumers';
import { parseArgs } from 'node:util';
import { buildRetryKey } from './budget/build-retry-key.ts';
import { findRetryDeny } from './budget/find-retry-deny.ts';
import { loadDenialState } from './budget/load-denial-state.ts';
import { planDenialBudget } from './budget/plan-denial-budget.ts';
import { resolveDenialStatePath } from './budget/resolve-denial-state-path.ts';
import type { DenialState } from './budget/types.ts';
import { writeDenialState } from './budget/write-denial-state.ts';
import type { ActionOutcome } from './classify-action.ts';
import { classifyAction } from './classify-action.ts';
import { buildJevOnlyConfig } from './config/build-jev-only-config.ts';
import { DEFAULT_DENIAL_BUDGET, DEFAULT_SCOPE_SOURCES, loadConfig } from './config/config.ts';
import { writeActionDiagnostic } from './diagnostics/write-action-diagnostic.ts';
import { loadPolicy } from './policy/load-policy.ts';
import { parseActionRequest } from './request/parse-action-request.ts';
import { parseScopeRecordRequest } from './request/parse-scope-record-request.ts';
import { renderVerdict } from './request/render-verdict.ts';
import type { Verdict } from './request/types.ts';
import { readPullRequest } from './scope/read-pull-request.ts';
import { updateSessionScope } from './scope/update-session-scope.ts';
import { resolveStateDir } from './state/resolve-state-dir.ts';

const USAGE = `auto-mode — a permission classifier for the auto-mode Claude Code mod

Usage:
  auto-mode run              Read an action request on stdin, write a verdict on stdout
  auto-mode print-prompt     Print the system prompt the classifier receives
  auto-mode record           Read a finished Bash call on stdin, add what it created to the session's scope

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

  printWarnings(loaded.warnings);

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
    const statePath = resolveDenialStatePath(request);
    const retryKey = buildRetryKey(request);

    const before = await loadDenialState(statePath);

    const retry = findRetryDeny(before, retryKey);

    const outcome: ActionOutcome =
      retry === null
        ? await classifyAction(request, config, {
            localOnly,
            deadlineAt,
            signal: controller.signal,
          })
        : {
            verdict: retry,
            decidingStage: 'retry',
            note: 'retry of the action just denied; denied again',
            status: 'deny',
          };

    // Re-read after the classifier, which can take seconds, so a parallel call
    // in the same session is less likely to lose its count.
    const latest = retry === null ? await loadDenialState(statePath) : before;

    const plan = planDenialBudget(
      latest,
      outcome.verdict,
      retryKey,
      config.denialBudget ?? DEFAULT_DENIAL_BUDGET,
    );

    if (plan.state !== latest) {
      await tryWriteDenialState(statePath, plan.state);
    }

    if (plan.verdict !== null) {
      writeVerdict(plan.verdict);
    }

    await writeActionDiagnostic(request, {
      invocationID,
      status: outcome.status,
      verdict: plan.verdict?.kind ?? 'defer',
      decidingStage: plan.escalation ? 'budget' : outcome.decidingStage,
      denials: { consecutive: plan.state.consecutive, session: plan.state.session },
      escalation: plan.escalation,
      ...(outcome.diagnostics === undefined ? {} : { diagnostics: outcome.diagnostics }),
    });

    const note = plan.escalation
      ? 'denial budget exhausted; the user decides this action'
      : outcome.note;

    return printNote(explain || outcome.unavailable === true, note);
  } finally {
    process.off('SIGTERM', stopEvaluation);
    process.off('SIGINT', stopEvaluation);
  }
}

// Writes nothing on stdout: a record is not a verdict, and a failure costs the
// session only the scope it would have gained.
async function runRecord(): Promise<number> {
  const raw = await readStdin();

  let body: unknown;

  try {
    body = JSON.parse(raw);
  } catch {
    return 0;
  }

  const request = parseScopeRecordRequest(body);

  if (request === null) {
    return 0;
  }

  try {
    const config = await loadConfig();

    const sources = Object.values(config.scopeSources ?? DEFAULT_SCOPE_SOURCES);

    if (sources.some((source) => source.kind === 'session')) {
      await updateSessionScope(request, {
        stateDir: resolveStateDir(),
        home: homedir(),
        readPullRequest,
      });
    }
  } catch {
    process.stderr.write('auto-mode: session scope unavailable\n');
  }

  return 0;
}

async function tryWriteDenialState(path: string, state: Readonly<DenialState>): Promise<void> {
  try {
    await writeDenialState(path, state);
  } catch {
    process.stderr.write('auto-mode: denial counts unavailable\n');
  }
}

function writeVerdict(verdict: Verdict): void {
  process.stdout.write(renderVerdict(verdict));
}

function printWarnings(warnings: readonly string[] = []): void {
  for (const warning of warnings) {
    process.stderr.write(`auto-mode: ${warning}\n`);
  }
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

  if (command === 'record') {
    return runRecord();
  }

  if (command === 'print-prompt') {
    const config = await loadConfig();

    printWarnings(config.warnings);

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
