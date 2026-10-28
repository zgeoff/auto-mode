import { expect, mock, onTestFinished, test } from 'bun:test';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { faker } from '@faker-js/faker';
import * as z from 'zod';
import { buildMockActionRequest } from '../../test-utils/factories/build-mock-action-request.ts';
import { buildMockHostEnvironment } from '../../test-utils/factories/build-mock-host-environment.ts';
import { writeActionDiagnostic } from './write-action-diagnostic.ts';

async function setupTest(): Promise<{ readonly directory: string }> {
  const directory = await mkdtemp(join(tmpdir(), 'action-diagnostics-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return { directory };
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

  const path = join(ctx.directory, 'private', 'actions.jsonl');

  const host = buildMockHostEnvironment({
    env: { AUTO_MODE_DIAGNOSTICS_PATH: path },
    home: ctx.directory,
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
      schemaVersion: 7,
      time: expect.toBeDateString(),
      invocationID: 'invocation',
      sessionHash: 'ad9ef8a88622d2c9',
      agentHash: 'ad9ef8a88622d2c9',
      actionHash: 'f5d171dc69611257',
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
      time: expect.toBeDateString(),
      invocationID: 'invocation',
      sessionHash: 'ad9ef8a88622d2c9',
      agentHash: 'ad9ef8a88622d2c9',
      actionHash: 'f5d171dc69611257',
      status: 'deny',
      verdict: 'deny',
      decidingStage: 'jev',
      denials: { consecutive: 1, session: 1 },
      escalation: false,
      diagnostics: null,
      judge: null,
      grant: null,
      action: null,
    },
  ]);

  expect(text).not.toInclude('private-');
});

test('it records a subagent under an agent hash apart from its parent session', async () => {
  const ctx = await setupTest();

  const path = join(ctx.directory, 'actions.jsonl');

  const host = buildMockHostEnvironment({
    env: { AUTO_MODE_DIAGNOSTICS_PATH: path },
    home: ctx.directory,
  });

  await writeActionDiagnostic(
    buildMockActionRequest({ sessionID: 's', decisionContext: { agentID: null } }),
    { invocationID: 'parent', status: 'started' },
    host,
    { write: mock() },
  );

  await writeActionDiagnostic(
    buildMockActionRequest({ sessionID: 's', decisionContext: { agentID: 'worker' } }),
    { invocationID: 'worker', status: 'started' },
    host,
    { write: mock() },
  );

  const text = await readFile(path, 'utf8');

  // Each hash is the first 16 hex digits of a sha256sum: of `printf s` for the
  // session and its main agent, and of `printf 's\0worker'` for the subagent.
  expect(
    text
      .trim()
      .split('\n')
      .map((line) =>
        z.object({ sessionHash: z.string(), agentHash: z.string() }).parse(JSON.parse(line)),
      ),
  ).toStrictEqual([
    { sessionHash: '043a718774c572bd', agentHash: '043a718774c572bd' },
    { sessionHash: '043a718774c572bd', agentHash: 'e281a6ae093eb49a' },
  ]);
});

test('it stamps a record with the time it was written', async () => {
  const ctx = await setupTest();

  const path = join(ctx.directory, 'actions.jsonl');
  const before = Date.now();

  await writeActionDiagnostic(
    buildMockActionRequest(),
    { invocationID: 'invocation', status: 'started' },
    buildMockHostEnvironment({ env: { AUTO_MODE_DIAGNOSTICS_PATH: path }, home: ctx.directory }),
    { write: mock() },
  );

  const after = Date.now();

  const text = await readFile(path, 'utf8');

  const record = z.object({ time: z.iso.datetime() }).parse(JSON.parse(text));

  expect(Date.parse(record.time)).toBeWithin(before, after + 1);
});

test('it creates the record file readable by its owner only', async () => {
  const ctx = await setupTest();

  const path = join(ctx.directory, 'private', 'actions.jsonl');

  await writeActionDiagnostic(
    buildMockActionRequest(),
    { invocationID: 'invocation', status: 'started' },
    buildMockHostEnvironment({ env: { AUTO_MODE_DIAGNOSTICS_PATH: path }, home: ctx.directory }),
    { write: mock() },
  );

  const info = await stat(path);

  expect(info.mode & 0o777).toBe(0o600);
});

test('it records the judge diagnostics and the action of an overturned deny', async () => {
  const ctx = await setupTest();

  const path = join(ctx.directory, 'actions.jsonl');

  await writeActionDiagnostic(
    buildMockActionRequest({
      sessionID: 's',
      toolUseID: undefined,
      cwd: '/work/repo',
      toolName: 'Bash',
      toolInput: { command: 'git push origin main' },
    }),
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
        answeringModel: 'claude-haiku-5-5',
        safetyStops: null,
        warm: true,
        rule: 'Default Branch Write',
        tier: 'soft',
        elapsedMs: 2400,
      },
    },
    buildMockHostEnvironment({ env: { AUTO_MODE_DIAGNOSTICS_PATH: path }, home: ctx.directory }),
    { write: mock() },
  );

  const text = await readFile(path, 'utf8');

  // The session and agent hashes are the first 16 hex digits of `printf s | sha256sum`.
  expect(JSON.parse(text)).toStrictEqual({
    schemaVersion: 7,
    time: expect.toBeDateString(),
    invocationID: 'i',
    sessionHash: '043a718774c572bd',
    agentHash: '043a718774c572bd',
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
      answeringModel: 'claude-haiku-5-5',
      safetyStops: null,
      warm: true,
      rule: 'Default Branch Write',
      tier: 'soft',
      elapsedMs: 2400,
    },
    grant: null,
    action: { tool: 'Bash', cwd: '/work/repo', input: '{"command":"git push origin main"}' },
  });
});

// Each fake secret is joined at runtime so that the repository's own secret
// scan does not read it as a leak.
test('it replaces each secret in the logged input of a held deny', async () => {
  const ctx = await setupTest();

  const path = join(ctx.directory, 'actions.jsonl');
  const token = ['ghp', '_', 'Zm9vYmFyYmF6cXV4MTIzNDU2Nzg5MGFiY2Rl'].join('');

  await writeActionDiagnostic(
    buildMockActionRequest({
      cwd: '/work/repo',
      toolName: 'Bash',
      toolInput: { command: `GH_TOKEN=${token} gh release create v1.2.0` },
    }),
    {
      invocationID: 'i',
      status: 'deny',
      verdict: 'deny',
      decidingStage: 'judge',
      judge: {
        status: 'held',
        overturnBasis: 'misread',
        failureReason: null,
        model: 'claude-haiku-5-5',
        answeringModel: 'claude-haiku-5-5',
        safetyStops: null,
        warm: false,
        rule: 'Publish and Release',
        tier: 'hard',
        elapsedMs: 1800,
      },
    },
    buildMockHostEnvironment({ env: { AUTO_MODE_DIAGNOSTICS_PATH: path }, home: ctx.directory }),
    { write: mock() },
  );

  const text = await readFile(path, 'utf8');

  expect(z.object({ action: z.unknown() }).parse(JSON.parse(text)).action).toStrictEqual({
    tool: 'Bash',
    cwd: '/work/repo',
    input: '{"command":"GH_TOKEN=[secret] gh release create v1.2.0"}',
  });
});

test('it replaces a quoted credential that JSON escaping would hide from the secret rules', async () => {
  const ctx = await setupTest();

  const path = join(ctx.directory, 'actions.jsonl');
  const credential = ['k9Xq2LmP', 'z8Rt4Wv7'].join('');

  await writeActionDiagnostic(
    buildMockActionRequest({
      cwd: '/work/repo',
      toolName: 'Bash',
      toolInput: {
        command: `curl https://api.example.com -H "Authorization: Bearer ${credential}"`,
      },
    }),
    {
      invocationID: 'i',
      status: 'deny',
      verdict: 'deny',
      decidingStage: 'judge',
      judge: {
        status: 'confirmed',
        overturnBasis: null,
        failureReason: null,
        model: 'claude-haiku-5-5',
        answeringModel: 'claude-haiku-5-5',
        safetyStops: null,
        warm: false,
        rule: 'Data Exfiltration',
        tier: 'hard',
        elapsedMs: 1600,
      },
    },
    buildMockHostEnvironment({ env: { AUTO_MODE_DIAGNOSTICS_PATH: path }, home: ctx.directory }),
    { write: mock() },
  );

  const text = await readFile(path, 'utf8');

  expect(z.object({ action: z.unknown() }).parse(JSON.parse(text)).action).toStrictEqual({
    tool: 'Bash',
    cwd: '/work/repo',
    input: String.raw`{"command":"curl https://api.example.com -H \"Authorization: Bearer [secret]\""}`,
  });
});

test('it replaces a quoted credential inside an array of the logged input', async () => {
  const ctx = await setupTest();

  const path = join(ctx.directory, 'actions.jsonl');
  const credential = ['k9Xq2LmP', 'z8Rt4Wv7'].join('');

  await writeActionDiagnostic(
    buildMockActionRequest({
      cwd: '/work/repo',
      toolName: 'mcp__runner__run_steps',
      toolInput: {
        steps: [
          'make build',
          `curl https://api.example.com -H "Authorization: Bearer ${credential}"`,
        ],
      },
    }),
    {
      invocationID: 'i',
      status: 'deny',
      verdict: 'deny',
      decidingStage: 'judge',
      judge: {
        status: 'held',
        overturnBasis: 'misread',
        failureReason: null,
        model: 'claude-haiku-5-5',
        answeringModel: 'claude-haiku-5-5',
        safetyStops: null,
        warm: false,
        rule: 'Data Exfiltration',
        tier: 'hard',
        elapsedMs: 1400,
      },
    },
    buildMockHostEnvironment({ env: { AUTO_MODE_DIAGNOSTICS_PATH: path }, home: ctx.directory }),
    { write: mock() },
  );

  const text = await readFile(path, 'utf8');

  expect(z.object({ action: z.unknown() }).parse(JSON.parse(text)).action).toStrictEqual({
    tool: 'mcp__runner__run_steps',
    cwd: '/work/repo',
    input: String.raw`{"steps":["make build","curl https://api.example.com -H \"Authorization: Bearer [secret]\""]}`,
  });
});

test('it logs no input when a secret is left after the redaction passes', async () => {
  const ctx = await setupTest();

  const path = join(ctx.directory, 'actions.jsonl');

  const tokens = Array.from({ length: 51 }, () =>
    ['ghp', '_', faker.string.alphanumeric(36)].join(''),
  );

  await writeActionDiagnostic(
    buildMockActionRequest({
      cwd: '/work/repo',
      toolName: 'Bash',
      toolInput: { command: `printf '%s\\n' ${tokens.join(' ')} > tokens.txt` },
    }),
    {
      invocationID: 'i',
      status: 'deny',
      verdict: 'deny',
      decidingStage: 'judge',
      judge: {
        status: 'confirmed',
        overturnBasis: null,
        failureReason: null,
        model: 'claude-haiku-5-5',
        answeringModel: 'claude-haiku-5-5',
        safetyStops: null,
        warm: false,
        rule: 'Secret Persistence',
        tier: 'hard',
        elapsedMs: 1700,
      },
    },
    buildMockHostEnvironment({ env: { AUTO_MODE_DIAGNOSTICS_PATH: path }, home: ctx.directory }),
    { write: mock() },
  );

  const text = await readFile(path, 'utf8');

  expect(z.object({ action: z.unknown() }).parse(JSON.parse(text)).action).toStrictEqual({
    tool: 'Bash',
    cwd: '/work/repo',
    input: null,
  });
});

test('it cuts the logged input of a reviewed grant to 2000 characters', async () => {
  const ctx = await setupTest();

  const path = join(ctx.directory, 'actions.jsonl');

  await writeActionDiagnostic(
    buildMockActionRequest({
      cwd: '/work/repo',
      toolName: 'Write',
      toolInput: { file_path: '/work/other/notes.md', content: 'a'.repeat(3000) },
    }),
    {
      invocationID: 'i',
      status: 'deny',
      verdict: 'deny',
      decidingStage: 'containment',
      grant: {
        status: 'confirmed',
        overturnBasis: null,
        failureReason: null,
        model: 'claude-haiku-5-5',
        answeringModel: 'claude-haiku-5-5',
        safetyStops: null,
        warm: false,
        rule: 'Outside Task Scope',
        tier: 'soft',
        elapsedMs: 1500,
      },
    },
    buildMockHostEnvironment({ env: { AUTO_MODE_DIAGNOSTICS_PATH: path }, home: ctx.directory }),
    { write: mock() },
  );

  const text = await readFile(path, 'utf8');

  expect(z.object({ action: z.unknown() }).parse(JSON.parse(text)).action).toStrictEqual({
    tool: 'Write',
    cwd: '/work/repo',
    input: `{"file_path":"/work/other/notes.md","content":"${'a'.repeat(1953)}`,
  });
});

test('it records no action hash for a request without a tool use id', async () => {
  const ctx = await setupTest();

  const path = join(ctx.directory, 'actions.jsonl');

  await writeActionDiagnostic(
    buildMockActionRequest({ sessionID: 's', toolUseID: undefined }),
    { invocationID: 'i', status: 'started' },
    buildMockHostEnvironment({ env: { AUTO_MODE_DIAGNOSTICS_PATH: path }, home: ctx.directory }),
    { write: mock() },
  );

  const text = await readFile(path, 'utf8');

  // The session and agent hashes are the first 16 hex digits of `printf s | sha256sum`.
  expect(JSON.parse(text)).toStrictEqual({
    schemaVersion: 7,
    time: expect.toBeDateString(),
    invocationID: 'i',
    sessionHash: '043a718774c572bd',
    agentHash: '043a718774c572bd',
    actionHash: null,
    status: 'started',
    verdict: null,
    decidingStage: null,
    denials: null,
    escalation: false,
    diagnostics: null,
    judge: null,
    grant: null,
    action: null,
  });
});

test('it preserves the verdict path when the diagnostic destination is unavailable', async () => {
  const ctx = await setupTest();

  const warnings = { write: mock() };

  await writeFile(join(ctx.directory, 'private'), 'not a directory');

  const written = writeActionDiagnostic(
    buildMockActionRequest(),
    { invocationID: 'i', status: 'failure', verdict: 'defer' },
    buildMockHostEnvironment({
      env: { AUTO_MODE_DIAGNOSTICS_PATH: join(ctx.directory, 'private', 'actions.jsonl') },
      home: ctx.directory,
    }),
    warnings,
  );

  await expect(written).toResolve();

  const blocker = await readFile(join(ctx.directory, 'private'), 'utf8');

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
      env: { AUTO_MODE_DIAGNOSTICS_PATH: '', XDG_STATE_HOME: join(ctx.directory, 'state') },
      home: ctx.directory,
    }),
    warnings,
  );

  expect(
    readFile(join(ctx.directory, 'state', 'auto-mode', 'actions.jsonl'), 'utf8'),
  ).rejects.toMatchObject({ code: 'ENOENT' });

  expect(warnings.write).not.toHaveBeenCalled();
});

test('it appends to the auto-mode state directory when no diagnostics path is set', async () => {
  const ctx = await setupTest();

  await writeActionDiagnostic(
    buildMockActionRequest({ sessionID: 's' }),
    { invocationID: 'i', status: 'started' },
    buildMockHostEnvironment({
      env: { XDG_STATE_HOME: join(ctx.directory, 'state') },
      home: ctx.directory,
    }),
    { write: mock() },
  );

  const text = await readFile(join(ctx.directory, 'state', 'auto-mode', 'actions.jsonl'), 'utf8');

  // The session and agent hashes are the first 16 hex digits of `printf s | sha256sum`.
  expect(JSON.parse(text)).toStrictEqual({
    schemaVersion: 7,
    time: expect.toBeDateString(),
    invocationID: 'i',
    sessionHash: '043a718774c572bd',
    agentHash: '043a718774c572bd',
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
  });
});
