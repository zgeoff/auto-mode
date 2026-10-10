import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { CaptureRecord } from './capture-record-schema.ts';
import { loadCaptureRecords } from './load-capture-records.ts';

async function setupTest(): Promise<{ readonly dir: string }> {
  const dir = await mkdtemp(join(tmpdir(), 'capture-records-'));

  onTestFinished(() => rm(dir, { recursive: true, force: true }));

  return { dir };
}

test('it reads every record of every file in order, skipping blank lines', async () => {
  const ctx = await setupTest();

  const record: CaptureRecord = {
    schemaVersion: 1,
    time: '2026-10-10T12:00:00.000Z',
    request: {
      sessionID: 's-1',
      cwd: '/tmp',
      toolName: 'Bash',
      toolInput: { command: 'make' },
      context: {
        agentID: null,
        originalUserTask: null,
        delegatedTask: null,
        lastDirectUserMessage: null,
        omittedTaskContext: [],
      },
    },
    verdict: { kind: 'allow' },
    decidingStage: 'jev',
    escalation: false,
  };

  await writeFile(join(ctx.dir, 'a.jsonl'), `${JSON.stringify(record)}\n\n`);

  await writeFile(
    join(ctx.dir, 'b.jsonl'),
    `${JSON.stringify({ ...record, verdict: null, decidingStage: 'budget', escalation: true })}\n`,
  );

  const records = await loadCaptureRecords([join(ctx.dir, 'a.jsonl'), join(ctx.dir, 'b.jsonl')]);

  expect(records).toStrictEqual([
    record,
    { ...record, verdict: null, decidingStage: 'budget', escalation: true },
  ]);
});

test('it names the file and line of a record that is not a capture record', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.dir, 'a.jsonl'), '{"schemaVersion":2}\n');

  expect(loadCaptureRecords([join(ctx.dir, 'a.jsonl')])).rejects.toThrowWithMessage(
    Error,
    `${join(ctx.dir, 'a.jsonl')}:1 is not a capture record.`,
  );
});

test('it names the file and line of a line that is not JSON', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.dir, 'a.jsonl'), '\n{oops\n');

  expect(loadCaptureRecords([join(ctx.dir, 'a.jsonl')])).rejects.toThrowWithMessage(
    Error,
    `${join(ctx.dir, 'a.jsonl')}:2 is not JSON.`,
  );
});
