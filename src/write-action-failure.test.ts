import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as z from 'zod';
import { buildStubOutput } from '../test-utils/build-stub-output.ts';
import { buildMockActionRequest } from '../test-utils/factories/build-mock-action-request.ts';
import { buildMockHostEnvironment } from '../test-utils/factories/build-mock-host-environment.ts';
import { writeActionFailure } from './write-action-failure.ts';

async function setupTest(): Promise<{ readonly directory: string }> {
  const directory = await mkdtemp(join(tmpdir(), 'auto-mode-action-failure-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return { directory };
}

test('it writes a started record and a deferred failure under one invocation', async () => {
  const ctx = await setupTest();

  await writeActionFailure(
    buildMockActionRequest(),
    buildMockHostEnvironment({
      env: { AUTO_MODE_DIAGNOSTICS_PATH: join(ctx.directory, 'actions.jsonl') },
    }),
    buildStubOutput(),
  );

  const log = await readFile(join(ctx.directory, 'actions.jsonl'), 'utf8');

  const records = log
    .trim()
    .split('\n')
    .map((line): unknown => JSON.parse(line));

  expect(records).toStrictEqual([
    {
      schemaVersion: 7,
      time: expect.toBeString(),
      invocationID: expect.toBeString(),
      sessionHash: expect.toBeString(),
      agentHash: expect.toBeString(),
      actionHash: expect.toBeString(),
      status: 'started',
      verdict: null,
      decidingStage: null,
      denials: null,
      escalation: false,
      diagnostics: null,
      judge: null,
      grant: null,
      action: null,
    },
    {
      schemaVersion: 7,
      time: expect.toBeString(),
      invocationID: expect.toBeString(),
      sessionHash: expect.toBeString(),
      agentHash: expect.toBeString(),
      actionHash: expect.toBeString(),
      status: 'failure',
      verdict: 'defer',
      decidingStage: null,
      denials: null,
      escalation: false,
      diagnostics: null,
      judge: null,
      grant: null,
      action: null,
    },
  ]);

  const invocationIDs = z
    .array(z.object({ invocationID: z.string() }))
    .parse(records)
    .map((record) => record.invocationID);

  expect(new Set(invocationIDs).size).toBe(1);
});
