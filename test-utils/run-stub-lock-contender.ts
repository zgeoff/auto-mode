import { appendFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { setTimeout as waitFor } from 'node:timers/promises';
import * as z from 'zod';
import { loadJSONFile } from '../src/state/load-json-file.ts';
import { updateJSONFile } from '../src/state/update-json-file.ts';

const [statePath, logPath, label, barrierDir, startAt] = process.argv.slice(2);
const contenders = Number(process.argv.at(7));

if (
  statePath === undefined ||
  logPath === undefined ||
  label === undefined ||
  barrierDir === undefined ||
  startAt === undefined ||
  !Number.isInteger(contenders)
) {
  throw new Error(
    'run-stub-lock-contender needs a state path, a log path, a label, a barrier directory, a start time and a contender count',
  );
}

const BARRIER_TIMEOUT_MS = 5000;

const sleeper = new Int32Array(new SharedArrayBuffer(4));

let readings = 0;

await updateJSONFile(
  statePath,
  (path) => {
    appendFileSync(logPath, `enter ${label}\n`);

    return loadJSONFile(path, z.strictObject({ count: z.number() }), { count: 0 });
  },
  (current) => {
    appendFileSync(logPath, `leave ${label}\n`);

    return { count: current.count + 1 };
  },
  {
    now: () => {
      readings += 1;

      if (readings === 2) {
        writeFileSync(join(barrierDir, label), '');

        const giveUpAt = Date.now() + BARRIER_TIMEOUT_MS;

        while (readdirSync(barrierDir).length < contenders) {
          if (Date.now() > giveUpAt) {
            throw new Error('run-stub-lock-contender waited too long at the barrier');
          }

          Atomics.wait(sleeper, 0, 0, 1);
        }
      }

      return Number(startAt);
    },
    wait: (delayMs) => waitFor(delayMs),
  },
);
