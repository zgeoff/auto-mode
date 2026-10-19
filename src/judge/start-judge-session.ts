import { tmpdir } from 'node:os';
import { query } from '@anthropic-ai/claude-agent-sdk';
import type {
  Query,
  SDKMessage,
  SDKResultMessage,
  SDKUserMessage,
} from '@anthropic-ai/claude-agent-sdk';
import * as z from 'zod';
import type { ModelRequest } from '../messages/anthropic-client.ts';
import { resolveExecutable } from '../process/resolve-executable.ts';
import { startCappedProcess } from '../process/start-capped-process.ts';
import type { JudgeMessageReply, JudgeSession } from './types.ts';

interface Turn {
  readonly result: SDKResultMessage;
  readonly fallbacks: number;
  readonly sessionFallback: boolean;
}

interface LiveProcess {
  readonly key: string;
  readonly send: (text: string) => Promise<Readonly<Turn>>;
  readonly stop: () => void;
  readonly closed: boolean;
  reviews: number;
  cleared: Promise<void>;
}

// One process answers every review, so only the first pays its start. Each
// review starts from a cleared conversation, because one review's evidence must
// never reach the next.
export function startJudgeSession(env: Readonly<Record<string, string | undefined>>): JudgeSession {
  let live: LiveProcess | null = null;
  let queue: Promise<void> = Promise.resolve();

  const stop = (): void => {
    live?.stop();
    live = null;
  };

  const runReview = async (
    model: string,
    request: Readonly<ModelRequest>,
    signal: Readonly<AbortSignal>,
  ): Promise<JudgeMessageReply> => {
    const key = `${model}\0${request.system}`;

    if (live !== null && (live.key !== key || live.closed)) {
      stop();
    }

    if (signal.aborted) {
      throw new DOMException('Judge review aborted', 'AbortError');
    }

    live ??= startLiveProcess(model, request.system, key, env);

    const current = live;
    const warm = current.reviews > 0;

    const onAbort = (): void => {
      if (live === current) {
        stop();
      }
    };

    signal.addEventListener('abort', onAbort, { once: true });

    try {
      await current.cleared;

      const turn = await current.send(request.user);

      current.reviews += 1;

      // A refusal fallback swaps the session's model for every later turn, so the
      // next review starts a process on the configured model instead.
      if (turn.sessionFallback) {
        stop();
      } else {
        current.cleared = sendClear(current.send, current.stop);
      }

      return buildReply(turn.result, turn.fallbacks, model, warm);
    } catch (error) {
      if (signal.aborted) {
        throw new DOMException('Judge review aborted', 'AbortError');
      }

      throw error;
    } finally {
      signal.removeEventListener('abort', onAbort);
    }
  };

  return {
    review: async (model, request, signal) => {
      const previous = queue;
      const turn = Promise.withResolvers<void>();

      queue = turn.promise;

      try {
        await waitUnlessAborted(previous, signal);

        return await runReview(model, request, signal);
      } finally {
        // A review that gave up while queued still holds its place, so the
        // reviews behind it keep their order.
        void waitThenRelease(previous, turn.resolve);
      }
    },
    stop,
  };
}

// Claude Code writes each reply as one stream-json line, and the judge server
// holds the process for the whole agent session, so the cap bounds each line.
const MAX_LINE_BYTES = 1024 * 1024;

interface TurnWaiter {
  readonly resolve: (turn: Readonly<Turn>) => void;
  readonly reject: (error: Readonly<Error>) => void;
  fallbacks: number;
  sessionFallback: boolean;
}

function startLiveProcess(
  model: string,
  system: string,
  key: string,
  env: Readonly<Record<string, string | undefined>>,
): LiveProcess {
  const input = makeInputChannel();
  const executable = resolveExecutable('claude', env['PATH']);
  let waiter: TurnWaiter | null = null;
  let closed = false;

  if (executable === null) {
    throw new Error('claude is not on the PATH');
  }

  const stream: Query = query({
    prompt: input.messages,
    options: {
      model,
      systemPrompt: system,
      tools: [],
      settingSources: [],
      strictMcpConfig: true,
      persistSession: false,
      thinking: { type: 'disabled' },
      pathToClaudeCodeExecutable: executable,
      cwd: tmpdir(),
      env: buildChildEnv(env),
      spawnClaudeCodeProcess: (spawned) =>
        startCappedProcess(spawned.command, spawned.args, {
          maxLineBytes: MAX_LINE_BYTES,
          cwd: spawned.cwd,
          env: spawned.env,
          signal: spawned.signal,
        }),
    },
  });

  const stopProcess = (): void => {
    if (closed) {
      return;
    }

    closed = true;

    input.close();
    stream.close();
    waiter?.reject(new Error('the judge process closed'));
    waiter = null;
  };

  const onMessage = (message: SDKMessage): void => {
    if (waiter === null) {
      return;
    }

    if (message.type === 'system' && message.subtype === 'model_refusal_fallback') {
      waiter.fallbacks += 1;
      waiter.sessionFallback ||= message.scope !== 'local';

      return;
    }

    if (message.type === 'result') {
      const done = waiter;

      waiter = null;

      done.resolve({
        result: message,
        fallbacks: done.fallbacks,
        sessionFallback: done.sessionFallback,
      });
    }
  };

  void readMessages(stream, onMessage, stopProcess);

  return {
    key,
    reviews: 0,
    cleared: Promise.resolve(),
    get closed() {
      return closed;
    },
    stop: stopProcess,
    send: (text) =>
      new Promise<Turn>((resolve, reject) => {
        if (closed) {
          reject(new Error('the judge process closed'));

          return;
        }

        waiter = { resolve, reject, fallbacks: 0, sessionFallback: false };

        input.push(text);
      }),
  };
}

interface InputReader {
  readonly shift: () => string | undefined;
  readonly isClosed: () => boolean;
  readonly waitForPush: () => Promise<void>;
}

function makeInputChannel(): {
  readonly messages: AsyncGenerator<SDKUserMessage>;
  readonly push: (text: string) => void;
  readonly close: () => void;
} {
  const pending: string[] = [];
  let wake: (() => void) | null = null;
  let closed = false;

  const emitWake = (): void => {
    const resume = wake;

    wake = null;
    resume?.();
  };

  const reader: InputReader = {
    shift: () => pending.shift(),
    isClosed: () => closed,
    waitForPush: () =>
      new Promise<void>((resolve) => {
        wake = resolve;
      }),
  };

  return {
    messages: readPending(reader),
    push: (text) => {
      pending.push(text);

      emitWake();
    },
    close: () => {
      closed = true;

      emitWake();
    },
  };
}

async function* readPending(reader: Readonly<InputReader>): AsyncGenerator<SDKUserMessage> {
  for (;;) {
    const next = reader.shift();

    if (next !== undefined) {
      yield {
        type: 'user',
        message: { role: 'user', content: next },
        parent_tool_use_id: null,
        session_id: '',
      };

      continue;
    }

    if (reader.isClosed()) {
      return;
    }

    await reader.waitForPush();
  }
}

const PROVIDER_SWITCHES = new Set([
  'CLAUDE_CODE_USE_BEDROCK',
  'CLAUDE_CODE_USE_VERTEX',
  'CLAUDE_CODE_USE_FOUNDRY',
]);

// A session pointed at another provider passes its endpoint and key in these
// variables, and the judge must reach Claude through the claude login instead.
function buildChildEnv(
  env: Readonly<Record<string, string | undefined>>,
): Record<string, string | undefined> {
  return Object.fromEntries(
    Object.entries(env).filter(
      ([name]) => !name.startsWith('ANTHROPIC_') && !PROVIDER_SWITCHES.has(name),
    ),
  );
}

async function readMessages(
  stream: Query,
  onMessage: (message: SDKMessage) => void,
  onEnd: () => void,
): Promise<void> {
  try {
    for await (const message of stream) {
      onMessage(message);
    }
  } catch {
    // A process that exits or fails ends the stream; the stop that follows
    // rejects the review it was answering.
  }

  onEnd();
}

// A failed clear ends the process, and the next review then starts a new one.
async function sendClear(
  send: (text: string) => Promise<Readonly<Turn>>,
  stop: () => void,
): Promise<void> {
  try {
    await send('/clear');
  } catch {
    stop();
  }
}

// The usage and the stop count are parsed apart from the result, so a malformed
// one keeps a readable reply on the configured model.
const MODEL_USAGE = z.record(z.string(), z.object({ outputTokens: z.number() }));
const SAFETY_STOPS = z.object({ safety_stops: z.number() });

function buildReply(
  result: SDKResultMessage,
  fallbacks: number,
  requested: string,
  warm: boolean,
): JudgeMessageReply {
  if (result.subtype !== 'success' || result.is_error) {
    throw new Error(`the judge turn ended in ${result.subtype}`);
  }

  const usage = MODEL_USAGE.safeParse(result.modelUsage).data;
  const stops = SAFETY_STOPS.safeParse(result).data?.safety_stops;

  return {
    text: result.result,
    model: pickAnsweringModel(usage, requested),
    safetyStops: stops ?? null,
    fallback: fallbacks > 0 || isFallbackReply(usage, stops),
    warm,
  };
}

// A safety stop makes Claude Code answer on a fallback model, so the reply's model
// comes from the usage. A background model writes fewer output tokens than the
// reply, and a model with none wrote no part of it.
function pickAnsweringModel(
  usage: Readonly<z.output<typeof MODEL_USAGE>> | undefined,
  requested: string,
): string {
  const writers = Object.entries(usage ?? {}).filter(([, entry]) => entry.outputTokens > 0);
  const [top] = writers.toSorted(([, left], [, right]) => right.outputTokens - left.outputTokens);

  return top === undefined ? requested : top[0];
}

// A model alias resolves to a canonical model ID in the usage, so a reply's model
// cannot show a fallback by name. A safety stop does; without the count, a model
// that wrote nothing beside the one that wrote the reply does.
function isFallbackReply(
  usage: Readonly<z.output<typeof MODEL_USAGE>> | undefined,
  stops: number | undefined,
): boolean {
  if (stops !== undefined) {
    return stops > 0;
  }

  const entries = Object.values(usage ?? {});

  return (
    entries.some((entry) => entry.outputTokens === 0) &&
    entries.some((entry) => entry.outputTokens > 0)
  );
}

function waitUnlessAborted(
  previous: Readonly<Promise<void>>,
  signal: Readonly<AbortSignal>,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const onAbort = (): void => {
      reject(new DOMException('Judge review aborted', 'AbortError'));
    };

    if (signal.aborted) {
      onAbort();

      return;
    }

    signal.addEventListener('abort', onAbort, { once: true });

    void waitThenRelease(previous, () => {
      signal.removeEventListener('abort', onAbort);

      resolve();
    });
  });
}

async function waitThenRelease(
  previous: Readonly<Promise<void>>,
  release: () => void,
): Promise<void> {
  await previous;

  release();
}
