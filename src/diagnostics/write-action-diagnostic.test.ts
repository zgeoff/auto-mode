import { expect, mock, onTestFinished, test } from 'bun:test';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as z from 'zod';
import { buildMockActionRequest } from '../../test-utils/factories/build-mock-action-request.ts';
import { buildMockHostEnvironment } from '../../test-utils/factories/build-mock-host-environment.ts';
import { writeActionDiagnostic } from './write-action-diagnostic.ts';

async function setupTest(): Promise<{ readonly dir: string }> {
  const dir = await mkdtemp(join(tmpdir(), 'action-diagnostics-'));

  onTestFinished(() => rm(dir, { recursive: true, force: true }));

  return { dir };
}

test('it appends private correlated records without action, task, credential, or identifier contents', async () => {
  const ctx = await setupTest();

  const payload = buildMockActionRequest({
    sessionID: 'private-session-canary',
    cwd: '/private-cwd-canary',
    toolName: 'private-tool-canary',
    toolInput: { command: 'private-command-canary' },
    toolUseID: 'private-action-canary',
    decisionContext: { originalUserTask: { text: 'private-task-canary' } },
  });

  const path = join(ctx.dir, 'private', 'actions.jsonl');

  const host = buildMockHostEnvironment({
    env: { AUTO_MODE_DIAGNOSTICS_PATH: path },
    home: ctx.dir,
  });

  await writeActionDiagnostic(payload, { invocationID: 'invocation', status: 'started' }, host, {
    write: mock(),
  });

  await writeActionDiagnostic(
    payload,
    {
      invocationID: 'invocation',
      status: 'deny',
      verdict: 'deny',
      decidingStage: 'jev',
      denials: { consecutive: 1, session: 1 },
      escalation: false,
    },
    host,
    { write: mock() },
  );

  const text = await readFile(path, 'utf8');

  // Each hash is the first 16 hex digits of `printf <id> | sha256sum`.
  expect(
    text
      .trim()
      .split('\n')
      .map((line): unknown => JSON.parse(line)),
  ).toStrictEqual([
    {
      schemaVersion: 4,
      time: expect.toBeDateString(),
      invocationID: 'invocation',
      sessionHash: 'ad9ef8a88622d2c9',
      actionHash: 'f5d171dc69611257',
      status: 'started',
      verdict: null,
      decidingStage: null,
      denials: null,
      escalation: false,
      diagnostics: null,
      judge: null,
    },
    {
      schemaVersion: 4,
      time: expect.toBeDateString(),
      invocationID: 'invocation',
      sessionHash: 'ad9ef8a88622d2c9',
      actionHash: 'f5d171dc69611257',
      status: 'deny',
      verdict: 'deny',
      decidingStage: 'jev',
      denials: { consecutive: 1, session: 1 },
      escalation: false,
      diagnostics: null,
      judge: null,
    },
  ]);

  expect(text).not.toInclude('private-');
});

test('it stamps a record with the time it was written', async () => {
  const ctx = await setupTest();

  const path = join(ctx.dir, 'actions.jsonl');
  const before = Date.now();

  await writeActionDiagnostic(
    buildMockActionRequest(),
    { invocationID: 'invocation', status: 'started' },
    buildMockHostEnvironment({ env: { AUTO_MODE_DIAGNOSTICS_PATH: path }, home: ctx.dir }),
    { write: mock() },
  );

  const after = Date.now();

  const text = await readFile(path, 'utf8');

  const record = z.object({ time: z.iso.datetime() }).parse(JSON.parse(text));

  expect(Date.parse(record.time)).toBeWithin(before, after + 1);
});

test('it creates the record file readable by its owner only', async () => {
  const ctx = await setupTest();

  const path = join(ctx.dir, 'private', 'actions.jsonl');

  await writeActionDiagnostic(
    buildMockActionRequest(),
    { invocationID: 'invocation', status: 'started' },
    buildMockHostEnvironment({ env: { AUTO_MODE_DIAGNOSTICS_PATH: path }, home: ctx.dir }),
    { write: mock() },
  );

  const info = await stat(path);

  expect(info.mode & 0o777).toBe(0o600);
});

test('it records the judge diagnostics of an overturned deny', async () => {
  const ctx = await setupTest();

  const path = join(ctx.dir, 'actions.jsonl');

  await writeActionDiagnostic(
    buildMockActionRequest({ sessionID: 's', toolUseID: undefined }),
    {
      invocationID: 'i',
      status: 'allow',
      verdict: 'allow',
      decidingStage: 'judge',
      judge: {
        status: 'overturned',
        overturnBasis: 'consent',
        failureReason: null,
        model: 'claude-haiku-5-5',
        rule: 'Default Branch Write',
        tier: 'soft',
        elapsedMs: 2400,
      },
    },
    buildMockHostEnvironment({ env: { AUTO_MODE_DIAGNOSTICS_PATH: path }, home: ctx.dir }),
    { write: mock() },
  );

  const text = await readFile(path, 'utf8');

  // The session hash is the first 16 hex digits of `printf s | sha256sum`.
  expect(JSON.parse(text)).toStrictEqual({
    schemaVersion: 4,
    time: expect.toBeDateString(),
    invocationID: 'i',
    sessionHash: '043a718774c572bd',
    actionHash: null,
    status: 'allow',
    verdict: 'allow',
    decidingStage: 'judge',
    denials: null,
    escalation: false,
    diagnostics: null,
    judge: {
      status: 'overturned',
      overturnBasis: 'consent',
      failureReason: null,
      model: 'claude-haiku-5-5',
      rule: 'Default Branch Write',
      tier: 'soft',
      elapsedMs: 2400,
    },
  });
});

test('it records no action hash for a request without a tool use id', async () => {
  const ctx = await setupTest();

  const path = join(ctx.dir, 'actions.jsonl');

  await writeActionDiagnostic(
    buildMockActionRequest({ sessionID: 's', toolUseID: undefined }),
    { invocationID: 'i', status: 'started' },
    buildMockHostEnvironment({ env: { AUTO_MODE_DIAGNOSTICS_PATH: path }, home: ctx.dir }),
    { write: mock() },
  );

  const text = await readFile(path, 'utf8');

  // The session hash is the first 16 hex digits of `printf s | sha256sum`.
  expect(JSON.parse(text)).toStrictEqual({
    schemaVersion: 4,
    time: expect.toBeDateString(),
    invocationID: 'i',
    sessionHash: '043a718774c572bd',
    actionHash: null,
    status: 'started',
    verdict: null,
    decidingStage: null,
    denials: null,
    escalation: false,
    diagnostics: null,
    judge: null,
  });
});

test('it preserves the verdict path when the diagnostic destination is unavailable', async () => {
  const ctx = await setupTest();

  const warnings = { write: mock() };

  await writeFile(join(ctx.dir, 'private'), 'not a directory');

  const written = writeActionDiagnostic(
    buildMockActionRequest(),
    { invocationID: 'i', status: 'failure', verdict: 'defer' },
    buildMockHostEnvironment({
      env: { AUTO_MODE_DIAGNOSTICS_PATH: join(ctx.dir, 'private', 'actions.jsonl') },
      home: ctx.dir,
    }),
    warnings,
  );

  await expect(written).toResolve();

  const blocker = await readFile(join(ctx.dir, 'private'), 'utf8');

  expect(blocker).toBe('not a directory');
  expect(warnings.write).toHaveBeenCalledExactlyOnceWith('auto-mode: diagnostics unavailable\n');
});

test('it writes nothing when the diagnostics path is empty', async () => {
  const ctx = await setupTest();

  const warnings = { write: mock() };

  await writeActionDiagnostic(
    buildMockActionRequest(),
    { invocationID: 'i', status: 'started' },
    buildMockHostEnvironment({
      env: { AUTO_MODE_DIAGNOSTICS_PATH: '', XDG_STATE_HOME: join(ctx.dir, 'state') },
      home: ctx.dir,
    }),
    warnings,
  );

  expect(
    readFile(join(ctx.dir, 'state', 'auto-mode', 'actions.jsonl'), 'utf8'),
  ).rejects.toMatchObject({ code: 'ENOENT' });

  expect(warnings.write).not.toHaveBeenCalled();
});

test('it appends to the auto-mode state directory when no diagnostics path is set', async () => {
  const ctx = await setupTest();

  await writeActionDiagnostic(
    buildMockActionRequest({ sessionID: 's' }),
    { invocationID: 'i', status: 'started' },
    buildMockHostEnvironment({ env: { XDG_STATE_HOME: join(ctx.dir, 'state') }, home: ctx.dir }),
    { write: mock() },
  );

  const text = await readFile(join(ctx.dir, 'state', 'auto-mode', 'actions.jsonl'), 'utf8');

  // The session hash is the first 16 hex digits of `printf s | sha256sum`.
  expect(JSON.parse(text)).toStrictEqual({
    schemaVersion: 4,
    time: expect.toBeDateString(),
    invocationID: 'i',
    sessionHash: '043a718774c572bd',
    actionHash: expect.toBeString(),
    status: 'started',
    verdict: null,
    decidingStage: null,
    denials: null,
    escalation: false,
    diagnostics: null,
    judge: null,
  });
});
