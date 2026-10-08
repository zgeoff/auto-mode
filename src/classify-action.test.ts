import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HttpResponse, http } from 'msw';
import * as z from 'zod';
import { server } from '../mocks/node.ts';
import { buildMockActionRequest } from '../test-utils/factories/build-mock-action-request.ts';
import { classifyAction } from './classify-action.ts';
import { DEFAULT_CONFIG } from './config/config.ts';

async function setupTest(): Promise<{ readonly dir: string; readonly settings: string }> {
  const dir = await mkdtemp(join(tmpdir(), 'auto-mode-classify-action-'));

  onTestFinished(() => rm(dir, { recursive: true, force: true }));

  const settings = join(dir, 'settings.json');

  await writeFile(settings, '{}');

  return { dir, settings };
}

test('it allows a read-only tool in the local tier', async () => {
  const ctx = await setupTest();

  const outcome = await classifyAction(
    buildMockActionRequest({ toolName: 'Read', toolInput: { file_path: '/repo/a.ts' } }),
    { ...DEFAULT_CONFIG, claudeSettingsPath: ctx.settings },
    { host: { env: {}, home: ctx.dir } },
  );

  expect(outcome).toStrictEqual({
    verdict: { kind: 'allow' },
    decidingStage: 'local',
    note: 'allowed by Read-only actions (local)',
    status: 'allow',
  });
});

test('it gives no verdict for an escalated action when the model tier is skipped', async () => {
  const ctx = await setupTest();

  const outcome = await classifyAction(
    buildMockActionRequest({
      cwd: '/repo',
      toolName: 'Bash',
      toolInput: { command: 'touch /repo/a.ts' },
    }),
    { ...DEFAULT_CONFIG, claudeSettingsPath: ctx.settings },
    { host: { env: {}, home: ctx.dir }, localOnly: true },
  );

  expect(outcome).toStrictEqual({
    verdict: null,
    decidingStage: 'local',
    note: 'Bash needs the model tier, which this run skipped',
    status: 'skipped',
  });
});

test('it sends a local allowance to the model tier when configured deny rules exist', async () => {
  const ctx = await setupTest();

  await writeFile(
    ctx.settings,
    JSON.stringify({ autoMode: { hard_deny: ['Never read the private key'] } }),
  );

  const outcome = await classifyAction(
    buildMockActionRequest({ toolName: 'Read', toolInput: { file_path: '/repo/key.pem' } }),
    { ...DEFAULT_CONFIG, claudeSettingsPath: ctx.settings },
    { host: { env: {}, home: ctx.dir }, localOnly: true },
  );

  expect(outcome.status).toBe('skipped');
});

test('it fails closed on unreadable Claude settings when configured to deny', async () => {
  const ctx = await setupTest();

  await writeFile(ctx.settings, 'not json {');

  const outcome = await classifyAction(
    buildMockActionRequest({ toolName: 'Read', toolInput: { file_path: '/repo/a.ts' } }),
    { ...DEFAULT_CONFIG, claudeSettingsPath: ctx.settings, onFailure: 'deny' },
    { host: { env: {}, home: ctx.dir } },
  );

  expect(outcome).toStrictEqual({
    verdict: {
      kind: 'deny',
      rule: 'Classifier Unavailable',
      reason:
        'Claude settings unreadable. Do not retry this action, and do not reach the same result another way: not with a different command, tool, script, file, or agent. Continue the task on a safer path that does not need this action. If no safer path exists for this step, finish the rest of the task first, then tell the user what you need from them for this step.',
    },
    decidingStage: 'jev',
    note: 'Claude settings unreadable; classifier unavailable',
    status: 'failure',
    unavailable: true,
  });
});

test('it denies an uncertain Jev decision with the rule, its fixed reason, and the safer-path instruction', async () => {
  const ctx = await setupTest();

  server.use(
    http.post('https://decision.test/v1/systemone', async (info) => {
      const json: unknown = await info.request.json();

      const body = z.object({ questions: z.record(z.string(), z.unknown()) }).parse(json);

      const answers = Object.fromEntries(
        Object.keys(body.questions).map((key) => [
          key,
          {
            type: 'choice',
            choice: 'ask',
            confidence: 1,
            probabilities: { allow: 0, block: 0, ask: 1 },
          },
        ]),
      );

      return HttpResponse.json({ model: 'jev-1.13.0', answers, usage: { input_tokens: 400 } });
    }),
  );

  const outcome = await classifyAction(
    buildMockActionRequest({ toolName: 'Bash', toolInput: { command: 'make deploy' } }),
    {
      ...DEFAULT_CONFIG,
      provider: {
        ...DEFAULT_CONFIG.provider,
        baseURL: 'https://decision.test',
        apiKeyEnv: 'AUTO_MODE_JEV_TEST_KEY',
      },
      claudeSettingsPath: ctx.settings,
    },
    { host: { env: { AUTO_MODE_JEV_TEST_KEY: 'test-key' }, home: ctx.dir } },
  );

  expect(outcome.verdict).toStrictEqual({
    kind: 'deny',
    rule: 'Data Exfiltration',
    reason:
      'The supplied evidence cannot rule out sending sensitive data, such as credentials or private code, off the machine. No instruction or configuration clears this rule. Do not retry this action, and do not reach the same result another way: not with a different command, tool, script, file, or agent. Continue the task on a safer path that does not need this action. If no safer path exists for this step, finish the rest of the task first, then tell the user what you need from them for this step.',
  });

  expect(outcome.status).toBe('deny');
});

test('it ends a failure reason with a full stop before the safer-path instruction', async () => {
  const ctx = await setupTest();

  const outcome = await classifyAction(
    buildMockActionRequest({
      cwd: '/repo',
      toolName: 'Bash',
      toolInput: { command: 'touch /repo/a.ts' },
    }),
    {
      ...DEFAULT_CONFIG,
      provider: { ...DEFAULT_CONFIG.provider, apiKeyEnv: 'AUTO_MODE_UNSET_TEST_KEY' },
      claudeSettingsPath: ctx.settings,
      onFailure: 'deny',
    },
    { host: { env: {}, home: ctx.dir } },
  );

  expect(outcome.verdict).toStrictEqual({
    kind: 'deny',
    rule: 'Classifier Unavailable',
    reason:
      'jev-1.13.0 unavailable: no API key: set the configured environment variable or key command. Do not retry this action, and do not reach the same result another way: not with a different command, tool, script, file, or agent. Continue the task on a safer path that does not need this action. If no safer path exists for this step, finish the rest of the task first, then tell the user what you need from them for this step.',
  });
});

test('it denies a write outside the task scope before a configured allow, Jev, or the judge can clear it', async () => {
  const ctx = await setupTest();

  let requests = 0;

  await writeFile(
    ctx.settings,
    JSON.stringify({
      autoMode: { allow: ['Removing any worktree under .worktrees/ is routine cleanup.'] },
    }),
  );

  server.use(
    http.post('https://decision.test/v1/systemone', () => {
      requests += 1;

      return HttpResponse.json({ model: 'jev-1.13.0', answers: {}, usage: { input_tokens: 1 } });
    }),
  );

  const judge = { ...DEFAULT_CONFIG.provider, baseURL: 'https://decision.test' };

  const outcome = await classifyAction(
    buildMockActionRequest({
      cwd: '/repo/.worktrees/feature',
      toolName: 'Bash',
      toolInput: { command: 'git worktree remove --force ../other' },
    }),
    {
      ...DEFAULT_CONFIG,
      provider: { ...judge, apiKeyEnv: 'AUTO_MODE_UNSET_TEST_KEY' },
      judge,
      claudeSettingsPath: ctx.settings,
    },
    { host: { env: {}, home: ctx.dir } },
  );

  expect(outcome).toStrictEqual({
    verdict: {
      kind: 'deny',
      rule: 'Outside Task Scope',
      reason:
        "This action writes outside the task scope: path /repo/.worktrees/other. The task owns the worktree /repo/.worktrees/feature. Do the work inside the task's own worktree and branch, or ask the user to extend the task scope to this target. Do not retry this action, and do not reach the same result another way: not with a different command, tool, script, file, or agent. Continue the task on a safer path that does not need this action. If no safer path exists for this step, finish the rest of the task first, then tell the user what you need from them for this step.",
    },
    decidingStage: 'containment',
    note: 'denied by the containment check: /repo/.worktrees/other',
    status: 'deny',
  });

  expect(requests).toBe(0);
});

test('it passes a target it cannot resolve to the classifier', async () => {
  const ctx = await setupTest();

  const outcome = await classifyAction(
    buildMockActionRequest({
      cwd: '/repo/.worktrees/feature',
      toolName: 'Bash',
      toolInput: { command: 'rm -rf "$OTHER_WORKTREE"' },
    }),
    { ...DEFAULT_CONFIG, claudeSettingsPath: ctx.settings },
    { host: { env: {}, home: ctx.dir }, localOnly: true },
  );

  expect(outcome.decidingStage).toBe('local');
  expect(outcome.status).toBe('skipped');
});

test('it denies a local regenerable-output removal in another worktree', async () => {
  const ctx = await setupTest();

  const outcome = await classifyAction(
    buildMockActionRequest({
      cwd: '/repo',
      toolName: 'Bash',
      toolInput: { command: 'rm -rf .worktrees/other/dist' },
    }),
    { ...DEFAULT_CONFIG, claudeSettingsPath: ctx.settings },
    { host: { env: {}, home: ctx.dir }, localOnly: true },
  );

  expect([outcome.decidingStage, outcome.status, outcome.note]).toStrictEqual([
    'containment',
    'deny',
    'denied by the containment check: /repo/.worktrees/other/dist',
  ]);
});

test('it still allows a local regenerable-output removal inside the task worktree', async () => {
  const ctx = await setupTest();

  const outcome = await classifyAction(
    buildMockActionRequest({
      cwd: '/repo',
      toolName: 'Bash',
      toolInput: { command: 'rm -rf dist' },
    }),
    { ...DEFAULT_CONFIG, claudeSettingsPath: ctx.settings },
    { host: { env: {}, home: ctx.dir }, localOnly: true },
  );

  expect(outcome).toStrictEqual({
    verdict: { kind: 'allow' },
    decidingStage: 'local',
    note: 'allowed by Regenerable output (local)',
    status: 'allow',
  });
});

test('it allows a file-tool write inside the cwd worktree without the model tier', async () => {
  const ctx = await setupTest();

  const outcome = await classifyAction(
    buildMockActionRequest({
      cwd: '/repo',
      toolName: 'Write',
      toolInput: { file_path: 'src/a.ts', content: 'export const a = 1;\n' },
    }),
    { ...DEFAULT_CONFIG, claudeSettingsPath: ctx.settings },
    { host: { env: {}, home: ctx.dir }, localOnly: true },
  );

  expect(outcome).toStrictEqual({
    verdict: { kind: 'allow' },
    decidingStage: 'bypass',
    note: 'allowed by the edit bypass: /repo/src/a.ts',
    status: 'allow',
  });
});

test('it sends an in-scope edit to the model tier when it writes an env file or a secret', async () => {
  const ctx = await setupTest();

  const token = ['ghp', '_', 'Zm9vYmFyYmF6cXV4MTIzNDU2Nzg5MGFiY2RlZmdo'].join('');

  const outcomes = await Promise.all(
    [
      { file_path: '/repo/.env', content: 'PORT=3000' },
      { file_path: '/repo/src/token.ts', content: `export const token = '${token}';` },
    ].map((toolInput) =>
      classifyAction(
        buildMockActionRequest({ cwd: '/repo', toolName: 'Write', toolInput }),
        { ...DEFAULT_CONFIG, claudeSettingsPath: ctx.settings },
        { host: { env: {}, home: ctx.dir }, localOnly: true },
      ),
    ),
  );

  expect(outcomes.map((outcome) => outcome.status)).toStrictEqual(['skipped', 'skipped']);
});

test('it sends an in-scope edit to the model tier when the user configured deny entries', async () => {
  const ctx = await setupTest();

  await writeFile(ctx.settings, JSON.stringify({ autoMode: { soft_deny: ['Never edit a.ts'] } }));

  const outcome = await classifyAction(
    buildMockActionRequest({
      cwd: '/repo',
      toolName: 'Write',
      toolInput: { file_path: '/repo/a.ts', content: 'x' },
    }),
    { ...DEFAULT_CONFIG, claudeSettingsPath: ctx.settings },
    { host: { env: {}, home: ctx.dir }, localOnly: true },
  );

  expect(outcome.status).toBe('skipped');
});
