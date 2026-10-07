import { expect, onTestFinished, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeActionDiagnostic } from './write-action-diagnostic.ts';

async function setupTest() {
  const dir = await mkdtemp(join(tmpdir(), 'action-diagnostics-'));

  const previous = process.env['AUTO_MODE_DIAGNOSTICS_PATH'];
  const path = join(dir, 'private', 'actions.jsonl');

  process.env['AUTO_MODE_DIAGNOSTICS_PATH'] = path;

  onTestFinished(async () => {
    if (previous === undefined) {
      delete process.env['AUTO_MODE_DIAGNOSTICS_PATH'];
    } else {
      process.env['AUTO_MODE_DIAGNOSTICS_PATH'] = previous;
    }

    await rm(dir, { recursive: true, force: true });
  });

  return { dir, path };
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

  await writeActionDiagnostic(payload, { invocationID: 'invocation', status: 'started' });

  await writeActionDiagnostic(payload, {
    invocationID: 'invocation',
    status: 'ask',
    verdict: 'ask',
  });

  const text = await readFile(ctx.path, 'utf8');

  const records: unknown[] = text
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line) as unknown);

  const sessionHash = createHash('sha256').update(payload.sessionID).digest('hex').slice(0, 16);
  const actionHash = createHash('sha256').update(payload.toolUseID).digest('hex').slice(0, 16);

  expect(records).toHaveLength(2);

  expect(records).toMatchObject([
    {
      schemaVersion: 2,
      invocationID: 'invocation',
      sessionHash,
      actionHash,
      status: 'started',
      verdict: null,
      diagnostics: null,
    },
    {
      schemaVersion: 2,
      invocationID: 'invocation',
      sessionHash,
      actionHash,
      status: 'ask',
      verdict: 'ask',
      diagnostics: null,
    },
  ]);

  expect(text).not.toInclude('private-');

  const info = await stat(ctx.path);

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
  );
});
