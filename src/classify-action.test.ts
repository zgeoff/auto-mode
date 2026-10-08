import { expect, mock, onTestFinished, test } from 'bun:test';
import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { http } from 'msw';
import { decisionAnswers } from '../mocks/decision-answers.ts';
import { DECISION_URL } from '../mocks/handlers.ts';
import { server } from '../mocks/node.ts';
import { sendDecisionReply } from '../mocks/send-decision-reply.ts';
import { buildMockActionRequest } from '../test-utils/factories/build-mock-action-request.ts';
import { buildMockConfig } from '../test-utils/factories/build-mock-config.ts';
import { runGit } from '../test-utils/run-git.ts';
import { classifyAction } from './classify-action.ts';

// Each test's host carries its own scratch paths, because the default treats every
// path under /tmp, which usually holds this temp root, as scratch space.
async function setupTest(): Promise<{ readonly dir: string }> {
  const created = await mkdtemp(join(tmpdir(), 'auto-mode-classify-action-'));

  onTestFinished(() => rm(created, { recursive: true, force: true }));

  const dir = await realpath(created);

  // The checkout search walks up from the cwd and would stop at any .git
  // above the temp root, so the repo is a checkout of its own.
  runGit(dir, ['init', '-q', '-b', 'main', join(dir, 'repo')]);

  return { dir };
}

test('it allows a read-only tool in the local tier', async () => {
  const ctx = await setupTest();

  const outcome = await classifyAction(
    buildMockActionRequest({
      cwd: join(ctx.dir, 'repo'),
      toolName: 'Read',
      toolInput: { file_path: join(ctx.dir, 'repo', 'a.ts') },
    }),
    buildMockConfig({
      provider: { protocol: 'system-one' },
      judge: null,
      claudeSettingsPath: null,
    }),
    { host: { env: {}, home: ctx.dir, scratchPaths: [] } },
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
      cwd: join(ctx.dir, 'repo'),
      toolName: 'Bash',
      toolInput: { command: `touch ${join(ctx.dir, 'repo', 'a.ts')}` },
    }),
    buildMockConfig({
      provider: { protocol: 'system-one' },
      judge: null,
      claudeSettingsPath: null,
    }),
    { host: { env: {}, home: ctx.dir, scratchPaths: [] }, localOnly: true },
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
    join(ctx.dir, 'settings.json'),
    JSON.stringify({ autoMode: { hard_deny: ['Never read the private key'] } }),
  );

  const outcome = await classifyAction(
    buildMockActionRequest({
      cwd: join(ctx.dir, 'repo'),
      toolName: 'Read',
      toolInput: { file_path: join(ctx.dir, 'repo', 'key.pem') },
    }),
    buildMockConfig({
      provider: { protocol: 'system-one' },
      judge: null,
      claudeSettingsPath: join(ctx.dir, 'settings.json'),
    }),
    { host: { env: {}, home: ctx.dir, scratchPaths: [] }, localOnly: true },
  );

  expect(outcome).toStrictEqual({
    verdict: null,
    decidingStage: 'local',
    note: 'Read needs the model tier, which this run skipped',
    status: 'skipped',
  });
});

test('it fails closed on unreadable Claude settings when configured to deny', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.dir, 'settings.json'), 'not json {');

  const outcome = await classifyAction(
    buildMockActionRequest({
      cwd: join(ctx.dir, 'repo'),
      toolName: 'Read',
      toolInput: { file_path: join(ctx.dir, 'repo', 'a.ts') },
    }),
    buildMockConfig({
      provider: { protocol: 'system-one' },
      judge: null,
      claudeSettingsPath: join(ctx.dir, 'settings.json'),
      onFailure: 'deny',
    }),
    { host: { env: {}, home: ctx.dir, scratchPaths: [] } },
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

  decisionAnswers.set('rule_0', {
    type: 'choice',
    choice: 'ask',
    confidence: 1,
    probabilities: { allow: 0, block: 0, ask: 1 },
  });

  const outcome = await classifyAction(
    buildMockActionRequest({
      cwd: join(ctx.dir, 'repo'),
      toolName: 'Bash',
      toolInput: { command: 'make deploy' },
    }),
    buildMockConfig({
      provider: { protocol: 'system-one', model: 'jev-1.13.0', apiKeyEnv: 'TYPESAFE_API_KEY' },
      judge: null,
      claudeSettingsPath: null,
      minConfidence: 0.8,
    }),
    { host: { env: { TYPESAFE_API_KEY: 'test-key' }, home: ctx.dir, scratchPaths: [] } },
  );

  expect(outcome).toStrictEqual({
    verdict: {
      kind: 'deny',
      rule: 'Data Exfiltration',
      reason:
        'The supplied evidence cannot rule out sending sensitive data, such as credentials or private code, off the machine. No instruction or configuration clears this rule. Do not retry this action, and do not reach the same result another way: not with a different command, tool, script, file, or agent. Continue the task on a safer path that does not need this action. If no safer path exists for this step, finish the rest of the task first, then tell the user what you need from them for this step.',
    },
    decidingStage: 'jev',
    note: expect.toStartWith('jev-1.13.0: deny ('),
    status: 'deny',
    diagnostics: {
      contributors: [
        {
          choice: 'ask',
          confidence: 1,
          probability: 1,
          rule: 'Data Exfiltration',
          source: 'shipped',
          tier: 'hard',
        },
      ],
      elapsedMs: expect.toBeNumber(),
      failureReason: null,
      keyResolved: true,
      keySource: 'environment',
      minConfidence: 0.8,
      requestBytes: expect.toBeNumber(),
      stage: 'response',
      status: 'deny',
    },
  });
});

test('it ends a failure reason with a full stop before the safer-path instruction', async () => {
  const ctx = await setupTest();

  const outcome = await classifyAction(
    buildMockActionRequest({
      cwd: join(ctx.dir, 'repo'),
      toolName: 'Bash',
      toolInput: { command: `touch ${join(ctx.dir, 'repo', 'a.ts')}` },
    }),
    buildMockConfig({
      provider: { protocol: 'system-one', model: 'jev-1.13.0', apiKeyEnv: 'TYPESAFE_API_KEY' },
      judge: null,
      claudeSettingsPath: null,
      onFailure: 'deny',
      minConfidence: 0.8,
    }),
    { host: { env: {}, home: ctx.dir, scratchPaths: [] } },
  );

  expect(outcome).toStrictEqual({
    verdict: {
      kind: 'deny',
      rule: 'Classifier Unavailable',
      reason:
        'jev-1.13.0 unavailable: no API key: set the configured environment variable or key command. Do not retry this action, and do not reach the same result another way: not with a different command, tool, script, file, or agent. Continue the task on a safer path that does not need this action. If no safer path exists for this step, finish the rest of the task first, then tell the user what you need from them for this step.',
    },
    decidingStage: 'jev',
    note: 'jev-1.13.0 unavailable: no API key: set the configured environment variable or key command',
    status: 'failure',
    unavailable: true,
    diagnostics: {
      contributors: [],
      elapsedMs: expect.toBeNumber(),
      failureReason: null,
      keyResolved: false,
      keySource: 'none',
      minConfidence: 0.8,
      requestBytes: null,
      stage: 'credential',
      status: 'failure',
    },
  });
});

test('it denies a write outside the task scope before a configured allow, Jev, or the judge can clear it', async () => {
  const ctx = await setupTest();

  const received = mock();

  runGit(ctx.dir, ['-C', join(ctx.dir, 'repo'), 'commit', '-q', '--allow-empty', '-m', 'init']);

  runGit(ctx.dir, [
    '-C',
    join(ctx.dir, 'repo'),
    'worktree',
    'add',
    '-q',
    '.worktrees/feature',
    '-b',
    'feature',
  ]);

  await writeFile(
    join(ctx.dir, 'settings.json'),
    JSON.stringify({
      autoMode: { allow: ['Removing any worktree under .worktrees/ is routine cleanup.'] },
    }),
  );

  server.use(
    http.post(DECISION_URL, (info) => {
      received();

      return sendDecisionReply(info);
    }),
  );

  const outcome = await classifyAction(
    buildMockActionRequest({
      cwd: join(ctx.dir, 'repo', '.worktrees', 'feature'),
      toolName: 'Bash',
      toolInput: { command: 'git worktree remove --force ../other' },
    }),
    buildMockConfig({
      provider: { protocol: 'system-one', apiKeyEnv: 'TYPESAFE_API_KEY' },
      judge: { protocol: 'system-one', apiKeyEnv: 'TYPESAFE_API_KEY' },
      claudeSettingsPath: join(ctx.dir, 'settings.json'),
    }),
    { host: { env: { TYPESAFE_API_KEY: 'test-key' }, home: ctx.dir, scratchPaths: [] } },
  );

  expect(outcome).toStrictEqual({
    verdict: {
      kind: 'deny',
      rule: 'Outside Task Scope',
      reason: `This action writes outside the task scope: path ${join(ctx.dir, 'repo', '.worktrees', 'other')}. The task owns the worktree ${join(ctx.dir, 'repo', '.worktrees', 'feature')} and the branch feature. Do the work inside the task's own worktree and branch, or ask the user to extend the task scope to this target. Do not retry this action, and do not reach the same result another way: not with a different command, tool, script, file, or agent. Continue the task on a safer path that does not need this action. If no safer path exists for this step, finish the rest of the task first, then tell the user what you need from them for this step.`,
    },
    decidingStage: 'containment',
    note: `denied by the containment check: ${join(ctx.dir, 'repo', '.worktrees', 'other')}`,
    status: 'deny',
  });

  expect(received).not.toHaveBeenCalled();
});

test('it passes a target it cannot resolve to the classifier', async () => {
  const ctx = await setupTest();

  const outcome = await classifyAction(
    buildMockActionRequest({
      cwd: join(ctx.dir, 'repo', '.worktrees', 'feature'),
      toolName: 'Bash',
      toolInput: { command: 'rm -rf "$OTHER_WORKTREE"' },
    }),
    buildMockConfig({
      provider: { protocol: 'system-one' },
      judge: null,
      claudeSettingsPath: null,
    }),
    { host: { env: {}, home: ctx.dir, scratchPaths: [] }, localOnly: true },
  );

  expect(outcome).toStrictEqual({
    verdict: null,
    decidingStage: 'local',
    note: 'Bash needs the model tier, which this run skipped',
    status: 'skipped',
  });
});

test('it denies a local regenerable-output removal in another worktree', async () => {
  const ctx = await setupTest();

  const outcome = await classifyAction(
    buildMockActionRequest({
      cwd: join(ctx.dir, 'repo'),
      toolName: 'Bash',
      toolInput: { command: 'rm -rf .worktrees/other/dist' },
    }),
    buildMockConfig({
      provider: { protocol: 'system-one' },
      judge: null,
      claudeSettingsPath: null,
    }),
    { host: { env: {}, home: ctx.dir, scratchPaths: [] }, localOnly: true },
  );

  expect(outcome).toStrictEqual({
    verdict: {
      kind: 'deny',
      rule: 'Outside Task Scope',
      reason: `This action writes outside the task scope: path ${join(ctx.dir, 'repo', '.worktrees', 'other', 'dist')}. The task owns the worktree ${join(ctx.dir, 'repo')}. Do the work inside the task's own worktree and branch, or ask the user to extend the task scope to this target. Do not retry this action, and do not reach the same result another way: not with a different command, tool, script, file, or agent. Continue the task on a safer path that does not need this action. If no safer path exists for this step, finish the rest of the task first, then tell the user what you need from them for this step.`,
    },
    decidingStage: 'containment',
    note: `denied by the containment check: ${join(ctx.dir, 'repo', '.worktrees', 'other', 'dist')}`,
    status: 'deny',
  });
});

test('it still allows a local regenerable-output removal inside the task worktree', async () => {
  const ctx = await setupTest();

  const outcome = await classifyAction(
    buildMockActionRequest({
      cwd: join(ctx.dir, 'repo'),
      toolName: 'Bash',
      toolInput: { command: 'rm -rf dist' },
    }),
    buildMockConfig({
      provider: { protocol: 'system-one' },
      judge: null,
      claudeSettingsPath: null,
    }),
    { host: { env: {}, home: ctx.dir, scratchPaths: [] }, localOnly: true },
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
      cwd: join(ctx.dir, 'repo'),
      toolName: 'Write',
      toolInput: { file_path: 'src/a.ts', content: 'export const a = 1;\n' },
    }),
    buildMockConfig({
      provider: { protocol: 'system-one' },
      judge: null,
      claudeSettingsPath: null,
    }),
    { host: { env: {}, home: ctx.dir, scratchPaths: [] }, localOnly: true },
  );

  expect(outcome).toStrictEqual({
    verdict: { kind: 'allow' },
    decidingStage: 'bypass',
    note: `allowed by the edit bypass: ${join(ctx.dir, 'repo', 'src', 'a.ts')}`,
    status: 'allow',
  });
});

test('it sends an in-scope edit to the model tier when it writes an env file', async () => {
  const ctx = await setupTest();

  const outcome = await classifyAction(
    buildMockActionRequest({
      cwd: join(ctx.dir, 'repo'),
      toolName: 'Write',
      toolInput: { file_path: join(ctx.dir, 'repo', '.env'), content: 'PORT=3000' },
    }),
    buildMockConfig({
      provider: { protocol: 'system-one' },
      judge: null,
      claudeSettingsPath: null,
    }),
    { host: { env: {}, home: ctx.dir, scratchPaths: [] }, localOnly: true },
  );

  expect(outcome).toStrictEqual({
    verdict: null,
    decidingStage: 'local',
    note: 'Write needs the model tier, which this run skipped',
    status: 'skipped',
  });
});

test('it sends an in-scope edit to the model tier when it writes a secret', async () => {
  const ctx = await setupTest();

  const token = ['ghp', '_', 'Zm9vYmFyYmF6cXV4MTIzNDU2Nzg5MGFiY2RlZmdo'].join('');

  const outcome = await classifyAction(
    buildMockActionRequest({
      cwd: join(ctx.dir, 'repo'),
      toolName: 'Write',
      toolInput: {
        file_path: join(ctx.dir, 'repo', 'src', 'token.ts'),
        content: `export const token = '${token}';`,
      },
    }),
    buildMockConfig({
      provider: { protocol: 'system-one' },
      judge: null,
      claudeSettingsPath: null,
    }),
    { host: { env: {}, home: ctx.dir, scratchPaths: [] }, localOnly: true },
  );

  expect(outcome).toStrictEqual({
    verdict: null,
    decidingStage: 'local',
    note: 'Write needs the model tier, which this run skipped',
    status: 'skipped',
  });
});

test('it sends an in-scope edit to the model tier when the user configured deny entries', async () => {
  const ctx = await setupTest();

  await writeFile(
    join(ctx.dir, 'settings.json'),
    JSON.stringify({ autoMode: { soft_deny: ['Never edit a.ts'] } }),
  );

  const outcome = await classifyAction(
    buildMockActionRequest({
      cwd: join(ctx.dir, 'repo'),
      toolName: 'Write',
      toolInput: { file_path: join(ctx.dir, 'repo', 'a.ts'), content: 'x' },
    }),
    buildMockConfig({
      provider: { protocol: 'system-one' },
      judge: null,
      claudeSettingsPath: join(ctx.dir, 'settings.json'),
    }),
    { host: { env: {}, home: ctx.dir, scratchPaths: [] }, localOnly: true },
  );

  expect(outcome).toStrictEqual({
    verdict: null,
    decidingStage: 'local',
    note: 'Write needs the model tier, which this run skipped',
    status: 'skipped',
  });
});
