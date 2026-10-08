import { expect, onTestFinished, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeActionDiagnostic } from './write-action-diagnostic.ts';

async function setupTest() {
  const dir = await mkdtemp(join(tmpdir(), 'action-diagnostics-'));

  onTestFinished(() => rm(dir, { recursive: true, force: true }));

  return { dir };
}

test('it appends private correlated records without action, task, credential, or identifier contents', async () => {
  const ctx = await setupTest();

  const payload = {
    sessionID: 'private-session-canary',
    cwd: '/private-cwd-canary',
    toolName: 'private-tool-canary',
    toolInput: { command: 'private-command-canary' },
    toolUseID: 'private-action-canary',
  };

  const path = join(ctx.dir, 'private', 'actions.jsonl');
  const host = { env: { AUTO_MODE_DIAGNOSTICS_PATH: path }, home: ctx.dir };

  await writeActionDiagnostic(payload, { invocationID: 'invocation', status: 'started' }, host);

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
  );

  const text = await readFile(path, 'utf8');

  const records: unknown[] = text
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line) as unknown);

  const sessionHash = createHash('sha256').update(payload.sessionID).digest('hex').slice(0, 16);
  const actionHash = createHash('sha256').update(payload.toolUseID).digest('hex').slice(0, 16);

  expect(records).toHaveLength(2);

  expect(records).toMatchObject([
    {
      schemaVersion: 3,
      invocationID: 'invocation',
      sessionHash,
      actionHash,
      status: 'started',
      verdict: null,
      decidingStage: null,
      denials: null,
      escalation: false,
      diagnostics: null,
    },
    {
      schemaVersion: 3,
      invocationID: 'invocation',
      sessionHash,
      actionHash,
      status: 'deny',
      verdict: 'deny',
      decidingStage: 'jev',
      denials: { consecutive: 1, session: 1 },
      escalation: false,
      diagnostics: null,
    },
  ]);

  expect(text).not.toInclude('private-');

  const info = await stat(path);

  expect(info.mode & 0o777).toBe(0o600);
});

test('it preserves the verdict path when the diagnostic destination is unavailable', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.dir, 'private'), 'not a directory');

  await writeActionDiagnostic(
    {
      sessionID: 's',
      cwd: '/repo',
      toolName: 'Bash',
      toolInput: {},
    },
    { invocationID: 'i', status: 'failure', verdict: 'defer' },
    {
      env: { AUTO_MODE_DIAGNOSTICS_PATH: join(ctx.dir, 'private', 'actions.jsonl') },
      home: ctx.dir,
    },
  );
});

test('it appends to the auto-mode state directory when no diagnostics path is set', async () => {
  const ctx = await setupTest();

  await writeActionDiagnostic(
    { sessionID: 's', cwd: ctx.dir, toolName: 'Bash', toolInput: {} },
    { invocationID: 'i', status: 'started' },
    { env: { XDG_STATE_HOME: join(ctx.dir, 'state') }, home: ctx.dir },
  );

  const text = await readFile(join(ctx.dir, 'state', 'auto-mode', 'actions.jsonl'), 'utf8');

  expect(text).toInclude('"invocationID":"i"');
});
