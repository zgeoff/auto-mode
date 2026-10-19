import { cli } from 'gunshi/bone';
import type { ArgValues, CommandContext } from 'gunshi/bone';
import { define, lazy } from 'gunshi/definition';
import {
  isArgsValidationError,
  isCommandNotFoundError,
  isCommandResolutionError,
} from 'gunshi/plugin';
import { resolveCaptureDir } from './capture/resolve-capture-dir.ts';
import type { CaptureOutcome } from './capture/try-write-request-capture.ts';
import { tryWriteRequestCapture } from './capture/try-write-request-capture.ts';
import { classifyAction } from './classify-action.ts';
import { buildJevOnlyConfig } from './config/build-jev-only-config.ts';
import { loadConfig } from './config/config.ts';
import type { Config } from './config/config.ts';
import { pickJudgeLane } from './config/pick-judge-lane.ts';
import { resolveShippedModDir } from './config/resolve-shipped-mod-dir.ts';
import type { OutputStream, Runtime } from './config/types.ts';
import { makeJudgeServerSession } from './judge/make-judge-server-session.ts';
import { resolveJudgeSocketPath } from './judge/resolve-judge-socket-path.ts';
import type { JudgeSession } from './judge/types.ts';
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
  readonly runtime: Readonly<Runtime>;
  readonly subscribeToStopSignals: (onStop: () => void) => () => void;

  // The program and script that run this CLI, so a run can start the judge
  // server; without it, each judge review starts its own process.
  readonly judgeServerCommand?: readonly [string, ...string[]] | undefined;
}

const USAGE = `auto-mode — a permission classifier for the auto-mode Claude Code mod

Usage:
  auto-mode run              Read an action request on stdin, write a verdict on stdout
  auto-mode print-prompt     Print the system prompt the classifier receives
  auto-mode record           Read a finished Bash call on stdin, add what it created to the session's scope
  auto-mode mod-path         Print the directory of the Claude Code mod this package ships
  auto-mode judge-server <socket>  Serve one agent session's judge reviews on a unix socket

Options:
  --classifier <path>   Use this framework file instead of the shipped one
  --rules <path>        Use this rule list instead of the shipped one
  --explain             With run: also write the reasoning to stderr
  --local-only          With run: skip the model tier
  --jev-only            With run: require Jev and cap its API timeout at 5 seconds
  --evaluation-deadline <unix-ms>  With --jev-only: share the helper and API deadline
`;

// Every command takes every flag; a flag a command does not read changes
// nothing.
const CLI_ARGS = {
  classifier: { type: 'string' },
  rules: { type: 'string' },
  explain: { type: 'boolean' },
  'local-only': { type: 'boolean' },
  'jev-only': { type: 'boolean' },
  'evaluation-deadline': { type: 'string' },
  help: { type: 'boolean', short: 'h' },
} as const;

type CLIValues = ArgValues<typeof CLI_ARGS>;

interface CLIParams {
  readonly args: typeof CLI_ARGS;
}

// What a command runs, given the flags and the words after its name, and the
// exit code it resolves to.
type CommandRun = (
  io: Readonly<CLIIO>,
  values: Readonly<CLIValues>,
  positionals: readonly string[],
) => Promise<number>;

const COMMANDS: ReadonlyMap<string, CommandRun> = new Map<string, CommandRun>([
  ['run', (io, values) => runClassification(io, values)],
  ['print-prompt', (io, values) => printPrompt(io, values)],
  ['record', (io) => runRecord(io)],
  ['mod-path', (io) => printModPath(io)],
  ['judge-server', (io, _values, positionals) => runJudgeServer(io, positionals[0])],
]);

export async function runCLI(argv: readonly string[], io: Readonly<CLIIO>): Promise<number> {
  let exitCode = 0;

  const subCommands = Object.fromEntries(
    [...COMMANDS].map(([name, runCommand]) => [
      name,
      lazy(
        () => async (ctx: Readonly<CommandContext<CLIParams>>) => {
          exitCode =
            ctx.values.help === true
              ? printUsage(io.stdout)
              : await runCommand(io, ctx.values, [
                  ...ctx.positionals.slice(ctx.commandPath.length),

                  // a word after `--` may start with a dash, and it is an argument too
                  ...ctx.rest,
                ]);
        },
        { name, args: CLI_ARGS },
      ),
    ]),
  );

  const entry = define({
    name: 'auto-mode',
    args: CLI_ARGS,

    // A command line with no command before `--` takes its command from the first word after it,
    // which the parser leaves unread.
    run: async (ctx) => {
      exitCode = await runCommandAfterTerminator(io, ctx.values, ctx.rest);
    },
  });

  try {
    await cli([...argv], entry, {
      subCommands,
      strict: true,
      onBeforeCommand: requireValidCommandLine,
    });
  } catch (error) {
    if (!isUsageError(error)) {
      throw error;
    }

    io.stderr.write(`auto-mode: ${formatUsageError(error)}\n\n${USAGE}`);

    return 2;
  }

  return exitCode;
}

// A run that fails before the classifier starts still exits 0, so the mod
// keeps the prompt instead of reading a failure.
async function runClassification(
  io: Readonly<CLIIO>,
  values: Readonly<CLIValues>,
): Promise<number> {
  try {
    return await run(io, {
      explain: values.explain === true,
      localOnly: values['local-only'] === true,
      jevOnly: values['jev-only'] === true,
      deadline: values['evaluation-deadline'],
    });
  } catch {
    io.stderr.write('auto-mode: configuration unreadable; no verdict\n');

    return 0;
  }
}

// Nothing tells the server that its agent session ended, so it ends after this
// long without a review, and a finished session leaves no judge process behind.
const JUDGE_IDLE_MS = 900_000;

interface RunOptions {
  readonly explain: boolean;
  readonly localOnly: boolean;
  readonly jevOnly: boolean;
  readonly deadline?: string | undefined;
}

async function run(io: Readonly<CLIIO>, options: Readonly<RunOptions>): Promise<number> {
  const raw = await io.stdin();

  let body: unknown;

  try {
    body = JSON.parse(raw);
  } catch {
    return printNote(io.stderr, options.explain, 'stdin is not JSON, so no verdict');
  }

  const request = parseActionRequest(body);

  if (request === null) {
    return printNote(
      io.stderr,
      options.explain,
      'not an action request this classifier judges, so no verdict',
    );
  }

  const host = io.runtime.host;
  let loaded;

  try {
    loaded = await loadConfig(undefined, host);
  } catch {
    await writeActionFailure(request, host, io.stderr);

    return printNote(io.stderr, true, 'configuration unreadable; no verdict');
  }

  printWarnings(io.stderr, loaded.warnings);

  const config = options.jevOnly ? buildJevOnlyConfig(loaded) : loaded;
  const deadlineAt = options.deadline === undefined ? undefined : Number(options.deadline);

  if (
    deadlineAt !== undefined &&
    (!options.jevOnly || !Number.isSafeInteger(deadlineAt) || deadlineAt <= 0)
  ) {
    await writeActionFailure(request, host, io.stderr);

    return printNote(io.stderr, true, 'invalid Jev evaluation deadline; no verdict');
  }

  const controller = new AbortController();

  const unsubscribe = options.jevOnly
    ? io.subscribeToStopSignals(() => {
        controller.abort();
      })
    : null;

  try {
    const outcome = await classifyAction(request, config, {
      localOnly: options.localOnly,
      deadlineAt,
      signal: controller.signal,
      runtime: io.runtime,
      stderr: io.stderr,
      budget: true,
      actionLog: true,
      judgeSession: buildJudgeServerSession(io, config, request.sessionID),
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

    return printNote(io.stderr, options.explain || outcome.unavailable === true, outcome.note);
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

// A Claude Code judge reaches the session's judge server when the CLI knows the
// command that runs itself; a Messages API judge needs no process of its own.
function buildJudgeServerSession(
  io: Readonly<CLIIO>,
  config: Readonly<Config>,
  sessionID: string,
): JudgeSession | undefined {
  const judge = config.judge ?? null;

  if (
    io.judgeServerCommand === undefined ||
    judge === null ||
    pickJudgeLane(judge).transport !== 'agent-sdk'
  ) {
    return undefined;
  }

  const command = io.judgeServerCommand;
  const entry = command[1] ?? command[0];

  return makeJudgeServerSession({
    socketPath: resolveJudgeSocketPath(io.runtime.host, sessionID, entry),
    command: io.judgeServerCommand,
    env: io.runtime.host.env,
    timeoutMs: judge.timeoutMs,
  });
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

async function printPrompt(io: Readonly<CLIIO>, values: Readonly<CLIValues>): Promise<number> {
  const config = await loadConfig(undefined, io.runtime.host);

  printWarnings(io.stderr, config.warnings);

  const prompt = await loadPolicy(
    {
      classifierPath: values.classifier ?? config.classifierPath,
      rulesPath: values.rules ?? config.rulesPath,
    },
    'decision.md',
  );

  io.stdout.write(`${prompt}\n`);

  return 0;
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
    const config = await loadConfig(undefined, io.runtime.host);

    await recordScope(request, config, io.runtime);
  } catch {
    io.stderr.write('auto-mode: session scope unavailable\n');
  }

  return 0;
}

function printModPath(io: Readonly<CLIIO>): Promise<number> {
  try {
    io.stdout.write(`${resolveShippedModDir()}\n`);

    return Promise.resolve(0);
  } catch (error) {
    io.stderr.write(`auto-mode: ${error instanceof Error ? error.message : String(error)}\n`);

    return Promise.resolve(1);
  }
}

// The server loads the Agent SDK, which a run that reaches a warm server never
// needs, so it loads only here.
async function runJudgeServer(
  io: Readonly<CLIIO>,
  socketPath: string | undefined,
): Promise<number> {
  if (socketPath === undefined) {
    io.stderr.write(`auto-mode: judge-server needs a socket path\n\n${USAGE}`);

    return 2;
  }

  const serverModule = await import('./judge/start-judge-server.ts');

  const server = await serverModule.startJudgeServer({
    socketPath,
    env: io.runtime.host.env,
    idleMs: JUDGE_IDLE_MS,
  });

  await server?.closed;

  return 0;
}

function printUsage(stdout: Readonly<OutputStream>): number {
  stdout.write(USAGE);

  return 0;
}

function runCommandAfterTerminator(
  io: Readonly<CLIIO>,
  values: Readonly<CLIValues>,
  rest: readonly string[],
): Promise<number> {
  const [command, ...positionals] = rest;

  if (values.help === true || command === undefined) {
    return Promise.resolve(printUsage(io.stdout));
  }

  const runCommand = COMMANDS.get(command);

  if (runCommand === undefined) {
    io.stderr.write(`auto-mode: unknown command '${command}'\n\n${USAGE}`);

    return Promise.resolve(2);
  }

  return runCommand(io, values, positionals);
}

// The parser records a flag that is missing its value without stopping the
// command, so the command line is checked before any command runs.
function requireValidCommandLine(ctx: Readonly<CommandContext>): void {
  if (ctx.validationError !== undefined) {
    throw ctx.validationError;
  }
}

// The parser throws one error that holds every reason it refused the command
// line, and nothing else it throws is a usage error.
function isUsageError(error: unknown): error is AggregateError {
  return (
    error instanceof AggregateError &&
    error.errors.every(
      (reason) =>
        isArgsValidationError(reason) ||
        isCommandNotFoundError(reason) ||
        isCommandResolutionError(reason),
    )
  );
}

function formatUsageError(error: AggregateError): string {
  return error.errors
    .map((reason: unknown) => {
      if (isCommandNotFoundError(reason)) {
        return `unknown command '${reason.commandName}'`;
      }

      return reason instanceof Error ? reason.message : String(reason);
    })
    .join('\n');
}
