import { parseArgs } from 'node:util';
import { resolveCaptureDir } from './capture/resolve-capture-dir.ts';
import type { CaptureOutcome } from './capture/try-write-request-capture.ts';
import { tryWriteRequestCapture } from './capture/try-write-request-capture.ts';
import { classifyAction } from './classify-action.ts';
import { buildJevOnlyConfig } from './config/build-jev-only-config.ts';
import { loadConfig } from './config/config.ts';
import { resolveShippedModDir } from './config/resolve-shipped-mod-dir.ts';
import type { HostEnvironment, OutputStream } from './config/types.ts';
import { loadPolicy } from './policy/load-policy.ts';
import { recordScope } from './record-scope.ts';
import { parseActionRequest } from './request/parse-action-request.ts';
import { parseScopeRecordRequest } from './request/parse-scope-record-request.ts';
import { renderVerdict } from './request/render-verdict.ts';
import { toModRequest } from './request/to-mod-request.ts';
import type { Verdict } from './request/types.ts';
import { writeActionFailure } from './write-action-failure.ts';

interface CLIIO {
  readonly stdin: () => Promise<string>;
  readonly stdout: Readonly<OutputStream>;
  readonly stderr: Readonly<OutputStream>;
  readonly host: Readonly<HostEnvironment>;
  readonly subscribeToStopSignals: (onStop: () => void) => () => void;
}

const USAGE = `auto-mode — a permission classifier for the auto-mode Claude Code mod

Usage:
  auto-mode run              Read an action request on stdin, write a verdict on stdout
  auto-mode print-prompt     Print the system prompt the classifier receives
  auto-mode record           Read a finished Bash call on stdin, add what it created to the session's scope
  auto-mode mod-path         Print the directory of the Claude Code mod this package ships

Options:
  --classifier <path>   Use this framework file instead of the shipped one
  --rules <path>        Use this rule list instead of the shipped one
  --explain             With run: also write the reasoning to stderr
  --local-only          With run: skip the model tier
  --jev-only            With run: require Jev and cap its API timeout at 5 seconds
  --evaluation-deadline <unix-ms>  With --jev-only: share the helper and API deadline
`;

export async function runCLI(argv: readonly string[], io: Readonly<CLIIO>): Promise<number> {
  const args = tryParseCLIArgs(argv);

  if (args instanceof Error) {
    io.stderr.write(`auto-mode: ${args.message}\n\n${USAGE}`);

    return 2;
  }

  const [command] = args.positionals;

  if (args.values.help === true || command === undefined) {
    io.stdout.write(USAGE);

    return 0;
  }

  if (command === 'run') {
    try {
      return await run(
        io,
        args.values.explain === true,
        args.values['local-only'] === true,
        args.values['jev-only'] === true,
        args.values['evaluation-deadline'],
      );
    } catch {
      io.stderr.write('auto-mode: configuration unreadable; no verdict\n');

      return 0;
    }
  }

  if (command === 'record') {
    return runRecord(io);
  }

  if (command === 'print-prompt') {
    const config = await loadConfig(undefined, io.host);

    printWarnings(io.stderr, config.warnings);

    const framework = config.provider.protocol === 'system-one' ? 'decision.md' : 'classifier.md';

    const prompt = await loadPolicy(
      {
        classifierPath: args.values.classifier ?? config.classifierPath,
        rulesPath: args.values.rules ?? config.rulesPath,
      },
      framework,
    );

    io.stdout.write(`${prompt}\n`);

    return 0;
  }

  if (command === 'mod-path') {
    try {
      io.stdout.write(`${resolveShippedModDir()}\n`);

      return 0;
    } catch (error) {
      io.stderr.write(`auto-mode: ${error instanceof Error ? error.message : String(error)}\n`);

      return 1;
    }
  }

  io.stderr.write(`auto-mode: unknown command '${command}'\n\n${USAGE}`);

  return 2;
}

// parseArgs throws on an unknown option or a missing value, and a usage error
// is the caller's to fix, so it exits 2 with the usage instead of a stack trace.
function tryParseCLIArgs(argv: readonly string[]) {
  try {
    return parseArgs({
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
  } catch (error) {
    return error instanceof Error ? error : new Error(String(error));
  }
}

async function run(
  io: Readonly<CLIIO>,
  explain: boolean,
  localOnly: boolean,
  jevOnly: boolean,
  deadline?: string,
): Promise<number> {
  const raw = await io.stdin();

  let body: unknown;

  try {
    body = JSON.parse(raw);
  } catch {
    return printNote(io.stderr, explain, 'stdin is not JSON, so no verdict');
  }

  const request = parseActionRequest(body);

  if (request === null) {
    return printNote(
      io.stderr,
      explain,
      'not an action request this classifier judges, so no verdict',
    );
  }

  const host = io.host;
  let loaded;

  try {
    loaded = await loadConfig(undefined, host);
  } catch {
    await writeActionFailure(request, host, io.stderr);

    return printNote(io.stderr, true, 'configuration unreadable; no verdict');
  }

  printWarnings(io.stderr, loaded.warnings);

  const config = jevOnly ? buildJevOnlyConfig(loaded) : loaded;

  if (config === null) {
    await writeActionFailure(request, host, io.stderr);

    return printNote(io.stderr, true, 'Jev-only evaluation requires system-one; no verdict');
  }

  const deadlineAt = deadline === undefined ? undefined : Number(deadline);

  if (
    deadlineAt !== undefined &&
    (!jevOnly || !Number.isSafeInteger(deadlineAt) || deadlineAt <= 0)
  ) {
    await writeActionFailure(request, host, io.stderr);

    return printNote(io.stderr, true, 'invalid Jev evaluation deadline; no verdict');
  }

  const controller = new AbortController();

  const unsubscribe = jevOnly
    ? io.subscribeToStopSignals(() => {
        controller.abort();
      })
    : null;

  try {
    const outcome = await classifyAction(request, config, {
      localOnly,
      deadlineAt,
      signal: controller.signal,
      host,
      stderr: io.stderr,
      budget: true,
      actionLog: true,
    });

    if (outcome.verdict !== null) {
      printVerdict(io.stdout, outcome.verdict);
    }

    if (config.capture?.enabled === true) {
      const captured = await tryWriteRequestCapture(resolveCaptureDir(config.capture, host), {
        schemaVersion: 1,
        time: new Date().toISOString(),
        request: toModRequest(request),
        verdict: outcome.verdict,
        decidingStage: outcome.decidingStage,
        escalation: outcome.escalation ?? false,
      });

      printCaptureNote(io.stderr, captured);
    }

    return printNote(io.stderr, explain || outcome.unavailable === true, outcome.note);
  } finally {
    unsubscribe?.();
  }
}

function printNote(stderr: Readonly<OutputStream>, explain: boolean, message: string): number {
  if (explain) {
    stderr.write(`auto-mode: ${message}\n`);
  }

  return 0;
}

function printWarnings(stderr: Readonly<OutputStream>, warnings: readonly string[] = []): void {
  for (const warning of warnings) {
    stderr.write(`auto-mode: ${warning}\n`);
  }
}

function printVerdict(stdout: Readonly<OutputStream>, verdict: Verdict): void {
  stdout.write(renderVerdict(verdict));
}

function printCaptureNote(stderr: Readonly<OutputStream>, captured: CaptureOutcome): void {
  if (captured.kind === 'refused') {
    stderr.write(`auto-mode: capture skipped: ${captured.reason}\n`);
  }

  if (captured.kind === 'failed') {
    stderr.write('auto-mode: capture unavailable\n');
  }
}

// Writes nothing on stdout: a record is not a verdict, and a failure costs the
// session only the scope it would have gained.
async function runRecord(io: Readonly<CLIIO>): Promise<number> {
  const raw = await io.stdin();

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
    const config = await loadConfig(undefined, io.host);

    await recordScope(request, config, { host: io.host });
  } catch {
    io.stderr.write('auto-mode: session scope unavailable\n');
  }

  return 0;
}
