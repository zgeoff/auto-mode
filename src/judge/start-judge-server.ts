import { randomBytes } from 'node:crypto';
import { chmod, mkdir, rename, rm, stat } from 'node:fs/promises';
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

  const answering = await isAnswering(options.socketPath);

  if (answering) {
    return null;
  }

  const server = createServer();
  const listenPath = `${options.socketPath}.${randomBytes(4).toString('hex')}`;

  await startListening(server, listenPath);
  await chmod(listenPath, 0o600);

  const own = await stat(listenPath);

  // A rename replaces the socket path in one step, so two servers that start
  // together never remove each other's listener: the last rename wins, and
  // the other stops.
  await rename(listenPath, options.socketPath);

  const current = await stat(options.socketPath).catch(() => null);

  if (current?.ino !== own.ino) {
    server.close();

    return null;
  }

  const session = startJudgeSession(options.env);
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
      void removeOwnSocket(options.socketPath, own.ino, closed.resolve);
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

  waitIdle();

  return { closed: closed.promise, stop };
}

// A server that another replaced leaves the newer socket in place.
async function removeOwnSocket(
  socketPath: string,
  ino: number,
  onRemoved: () => void,
): Promise<void> {
  const current = await stat(socketPath).catch(() => null);

  if (current?.ino === ino) {
    await rm(socketPath, { force: true });
  }

  onRemoved();
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

  // A client keeps its side open until the answer arrives, so its end, as much
  // as its close, means nobody waits for the review.
  const stopUnanswered = (): void => {
    if (!answered) {
      controller.abort();
    }
  };

  socket.on('end', stopUnanswered);
  socket.on('close', stopUnanswered);
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
