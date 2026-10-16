import { chmod, mkdir, rm } from 'node:fs/promises';
import { connect, createServer } from 'node:net';
import type { Server, Socket } from 'node:net';
import { dirname } from 'node:path';
import type * as z from 'zod';
import { judgeServerRequestSchema } from './judge-server-request-schema.ts';
import type { judgeServerResponseSchema } from './judge-server-response-schema.ts';
import { startJudgeSession } from './start-judge-session.ts';
import type { JudgeSession } from './types.ts';

export interface JudgeServer {
  readonly closed: Promise<void>;
  readonly stop: () => void;
}

export interface JudgeServerOptions {
  readonly socketPath: string;
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly idleMs: number;
}

// One server holds one agent session's judge process warm between prompted
// calls. It resolves null when another server already answers on the socket.
export async function startJudgeServer(
  options: Readonly<JudgeServerOptions>,
): Promise<JudgeServer | null> {
  await mkdir(dirname(options.socketPath), { recursive: true, mode: 0o700 });

  const session = startJudgeSession(options.env);
  const server = createServer({ allowHalfOpen: true });
  const closed = Promise.withResolvers<void>();
  let idleTimer: NodeJS.Timeout | null = null;
  let active = 0;
  let stopped = false;

  const stop = (): void => {
    if (stopped) {
      return;
    }

    stopped = true;

    if (idleTimer !== null) {
      clearTimeout(idleTimer);
    }

    session.stop();

    server.close(() => {
      void removeSocket(options.socketPath, closed.resolve);
    });
  };

  const waitIdle = (): void => {
    idleTimer = setTimeout(stop, options.idleMs);

    idleTimer.unref();
  };

  const runConnection = async (socket: Socket): Promise<void> => {
    active += 1;

    if (idleTimer !== null) {
      clearTimeout(idleTimer);

      idleTimer = null;
    }

    await runReview(socket, session);

    active -= 1;

    if (active === 0) {
      waitIdle();
    }
  };

  server.on('connection', (socket) => {
    void runConnection(socket);
  });

  const listening = await tryStartListening(server, options.socketPath);

  if (!listening) {
    session.stop();

    return null;
  }

  await chmod(options.socketPath, 0o600);

  waitIdle();

  return { closed: closed.promise, stop };
}

async function removeSocket(socketPath: string, onRemoved: () => void): Promise<void> {
  await rm(socketPath, { force: true });

  onRemoved();
}

// A socket file that no server answers on is left by one that died, so it is
// removed; one that answers belongs to a live server, which this one leaves be.
async function tryStartListening(server: Server, socketPath: string): Promise<boolean> {
  try {
    await startListening(server, socketPath);

    return true;
  } catch (error) {
    if (!isErrorCode(error, 'EADDRINUSE')) {
      return false;
    }
  }

  const answering = await isAnswering(socketPath);

  if (answering) {
    return false;
  }

  await rm(socketPath, { force: true });

  try {
    await startListening(server, socketPath);

    return true;
  } catch {
    return false;
  }
}

function startListening(server: Server, socketPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);

    server.listen(socketPath, () => {
      server.off('error', reject);

      resolve();
    });
  });
}

function isAnswering(socketPath: string): Promise<boolean> {
  return new Promise((resolve) => {
    const probe = connect(socketPath);

    probe.once('connect', () => {
      probe.destroy();

      resolve(true);
    });

    probe.once('error', () => {
      resolve(false);
    });
  });
}

const MAX_REQUEST_BYTES = 4_194_304;

// The review stops at the judge's own limit, and when the client goes away,
// because a review nobody waits for only delays the next one.
async function runReview(socket: Socket, session: JudgeSession): Promise<void> {
  const controller = new AbortController();

  let answered = false;

  socket.on('close', () => {
    if (!answered) {
      controller.abort();
    }
  });

  socket.on('error', () => {});

  const line = await readLine(socket, MAX_REQUEST_BYTES);

  const request = judgeServerRequestSchema.safeParse(parseJSON(line));

  if (!request.success) {
    answered = true;

    writeResponse(socket, { kind: 'failure', aborted: false, message: 'malformed request' });

    return;
  }

  const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(request.data.timeoutMs)]);
  let response: z.output<typeof judgeServerResponseSchema>;

  try {
    const reply = await session.review(
      request.data.model,
      { system: request.data.system, user: request.data.user },
      signal,
    );

    response = { kind: 'reply', ...reply };
  } catch (error) {
    response = {
      kind: 'failure',
      aborted: signal.aborted,
      message: error instanceof Error ? error.message : String(error),
    };
  }

  answered = true;

  writeResponse(socket, response);
}

function readLine(socket: Socket, maxBytes: number): Promise<string> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let size = 0;

    const stopReading = (): void => {
      socket.off('data', onData);
      socket.off('end', stopReading);
      socket.off('close', stopReading);

      resolve(Buffer.concat(chunks).toString('utf8').split('\n')[0] ?? '');
    };

    const onData = (chunk: Buffer): void => {
      chunks.push(chunk);

      size += chunk.length;

      if (size > maxBytes || chunk.includes(10)) {
        stopReading();
      }
    };

    socket.on('data', onData);
    socket.once('end', stopReading);
    socket.once('close', stopReading);
  });
}

function writeResponse(socket: Socket, response: z.output<typeof judgeServerResponseSchema>): void {
  if (!socket.destroyed) {
    socket.end(`${JSON.stringify(response)}\n`);
  }
}

function parseJSON(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function isErrorCode(error: unknown, code: string): boolean {
  return error instanceof Error && 'code' in error && error.code === code;
}
