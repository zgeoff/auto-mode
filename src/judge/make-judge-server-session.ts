import { connect } from 'node:net';
import type { Socket } from 'node:net';
import { setTimeout as wait } from 'node:timers/promises';
import { startDetachedProcess } from '../process/start-detached-process.ts';
import { judgeServerResponseSchema } from './judge-server-response-schema.ts';
import type { JudgeSession } from './types.ts';

export interface JudgeServerTarget {
  readonly socketPath: string;
  readonly command: readonly [string, ...string[]];
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly timeoutMs: number;
}

export function makeJudgeServerSession(target: Readonly<JudgeServerTarget>): JudgeSession {
  return {
    review: async (model, request, signal) => {
      const socket = await tryConnectOrStartServer(target, signal);

      const line = `${JSON.stringify({ model, timeoutMs: target.timeoutMs, ...request })}\n`;

      const answer = await sendLine(socket, line, signal);

      const response = judgeServerResponseSchema.parse(JSON.parse(answer));

      if (response.kind === 'failure') {
        throw response.aborted
          ? new DOMException(response.message, 'AbortError')
          : new Error(response.message);
      }

      const { kind: _kind, ...reply } = response;

      return reply;
    },
    stop: () => {},
  };
}

const START_WAIT_MS = 10_000;
const START_POLL_MS = 25;

async function tryConnectOrStartServer(
  target: Readonly<JudgeServerTarget>,
  signal: Readonly<AbortSignal>,
): Promise<Socket> {
  const existing = await tryConnect(target.socketPath);

  if (existing !== null) {
    return existing;
  }

  const [file, ...args] = target.command;

  startDetachedProcess(file, [...args, 'judge-server', target.socketPath], target.env);

  const deadline = Date.now() + START_WAIT_MS;

  while (Date.now() < deadline) {
    await wait(START_POLL_MS, undefined, { signal });

    const socket = await tryConnect(target.socketPath);

    if (socket !== null) {
      return socket;
    }
  }

  throw new Error('the judge server did not start');
}

function tryConnect(socketPath: string): Promise<Socket | null> {
  return new Promise((resolve) => {
    const socket = connect(socketPath);

    socket.once('connect', () => {
      socket.off('error', onError);

      resolve(socket);
    });

    const onError = (): void => {
      resolve(null);
    };

    socket.once('error', onError);
  });
}

function sendLine(socket: Socket, line: string, signal: Readonly<AbortSignal>): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];

    const onAbort = (): void => {
      socket.destroy();

      reject(new DOMException('Judge review aborted', 'AbortError'));
    };

    if (signal.aborted) {
      onAbort();

      return;
    }

    signal.addEventListener('abort', onAbort, { once: true });

    socket.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
    });

    socket.once('error', (error) => {
      signal.removeEventListener('abort', onAbort);

      reject(error);
    });

    socket.once('end', () => {
      signal.removeEventListener('abort', onAbort);
      socket.destroy();

      resolve(Buffer.concat(chunks).toString('utf8').trim());
    });

    socket.write(line);
  });
}
