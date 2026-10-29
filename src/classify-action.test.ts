import { expect, mock, onTestFinished, test } from 'bun:test';
import { constants } from 'node:fs';
import { mkdir, mkdtemp, open, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { http } from 'msw';
import invariant from 'tiny-invariant';
import * as z from 'zod';
import { decisionAnswers } from '../mocks/decision-answers.ts';
import { DECISION_URL } from '../mocks/handlers.ts';
import { server } from '../mocks/node.ts';
import { sendDecisionReply } from '../mocks/send-decision-reply.ts';
import { buildStubOutput } from '../test-utils/build-stub-output.ts';
import { buildMockActionRequest } from '../test-utils/factories/build-mock-action-request.ts';
import { buildMockConfig } from '../test-utils/factories/build-mock-config.ts';
import { buildMockDecisionAnswer } from '../test-utils/factories/build-mock-decision-answer.ts';
import { buildMockRuntime } from '../test-utils/factories/build-mock-runtime.ts';
import { runGit } from '../test-utils/run-git.ts';
import { classifyAction } from './classify-action.ts';
import { readCheckout } from './git/read-checkout.ts';

async function setupTest(): Promise<{
  readonly directory: string;
  readonly binDir: string;
  readonly recordPath: string;
}> {
  const created = await mkdtemp(join(tmpdir(), 'auto-mode-classify-action-'));

  onTestFinished(() => rm(created, { recursive: true, force: true }));

  const directory = await realpath(created);

  // The checkout search walks up from the cwd and would stop at any .git
  // above the temp root, so the repo is a checkout of its own.
  runGit(directory, ['init', '-q', '-b', 'main', join(directory, 'repo')]);

  const binDir = join(directory, 'bin');

  await mkdir(binDir);

  // the judge finds `claude` through the host PATH a test passes, so the stub stands in for it
  await writeFile(
    join(binDir, 'claude'),
    `#!/bin/sh\nexec "${process.execPath}" "${join(import.meta.dir, '..', 'test-utils', 'run-stub-claude.ts')}" "$@"\n`,
    { mode: 0o755 },
  );

  return { directory, binDir, recordPath: join(directory, 'claude-calls.jsonl') };
}

test('it allows a read-only tool in the local tier', async () => {
  const ctx = await setupTest();

  const outcome = await classifyAction(
    buildMockActionRequest({
      cwd: join(ctx.directory, 'repo'),
      toolName: 'Read',
      toolInput: { file_path: join(ctx.directory, 'repo', 'a.ts') },
    }),
    buildMockConfig({
      provider: { protocol: 'system-one' },
      judge: null,
      claudeSettingsPath: null,
    }),
    {
      stderr: buildStubOutput(),
      runtime: buildMockRuntime({ env: {}, home: ctx.directory, scratchPaths: [] }),
    },
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
      cwd: join(ctx.directory, 'repo'),
      toolName: 'Bash',
      toolInput: { command: `touch ${join(ctx.directory, 'repo', 'a.ts')}` },
    }),
    buildMockConfig({
      provider: { protocol: 'system-one' },
      judge: null,
      claudeSettingsPath: null,
    }),
    {
      stderr: buildStubOutput(),
      runtime: buildMockRuntime({ env: {}, home: ctx.directory, scratchPaths: [] }),
      localOnly: true,
    },
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
    join(ctx.directory, 'settings.json'),
    JSON.stringify({ autoMode: { hard_deny: ['Never read the private key'] } }),
  );

  const outcome = await classifyAction(
    buildMockActionRequest({
      cwd: join(ctx.directory, 'repo'),
      toolName: 'Read',
      toolInput: { file_path: join(ctx.directory, 'repo', 'key.pem') },
    }),
    buildMockConfig({
      provider: { protocol: 'system-one' },
      judge: null,
      claudeSettingsPath: join(ctx.directory, 'settings.json'),
    }),
    {
      stderr: buildStubOutput(),
      runtime: buildMockRuntime({ env: {}, home: ctx.directory, scratchPaths: [] }),
      localOnly: true,
    },
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

  await writeFile(join(ctx.directory, 'settings.json'), 'not json {');

  const outcome = await classifyAction(
    buildMockActionRequest({
      cwd: join(ctx.directory, 'repo'),
      toolName: 'Read',
      toolInput: { file_path: join(ctx.directory, 'repo', 'a.ts') },
    }),
    buildMockConfig({
      provider: { protocol: 'system-one' },
      judge: null,
      claudeSettingsPath: join(ctx.directory, 'settings.json'),
      onFailure: 'deny',
    }),
    {
      stderr: buildStubOutput(),
      runtime: buildMockRuntime({ env: {}, home: ctx.directory, scratchPaths: [] }),
    },
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

test('it denies an unsure Jev allow that reaches the block threshold with the rule, its fixed reason, and the safer-path instruction', async () => {
  const ctx = await setupTest();

  decisionAnswers.set(
    'rule_0',
    buildMockDecisionAnswer({
      choice: 'allow',
      confidence: 0.7,
      probabilities: { allow: 0.7, block: 0.3 },
    }),
  );

  const received = mock<(body: unknown) => void>();

  server.use(
    http.post(DECISION_URL, async (info) => {
      const body: unknown = await info.request.clone().json();

      received(body);
    }),
  );

  const startedAt = performance.now();

  const outcome = await classifyAction(
    buildMockActionRequest({
      cwd: join(ctx.directory, 'repo'),
      toolName: 'Bash',
      toolInput: { command: 'make deploy' },
    }),
    buildMockConfig({
      provider: { protocol: 'system-one', model: 'jev-1.13.0', apiKeyEnv: 'TYPESAFE_API_KEY' },
      judge: null,
      claudeSettingsPath: null,
      blockThreshold: 0.2,
    }),
    {
      stderr: buildStubOutput(),
      runtime: buildMockRuntime({
        env: { TYPESAFE_API_KEY: 'test-key' },
        home: ctx.directory,
        scratchPaths: [],
      }),
    },
  );

  const elapsedMs = performance.now() - startedAt;

  expect(outcome).toStrictEqual({
    verdict: {
      kind: 'deny',
      rule: 'Data Exfiltration',
      reason:
        'The supplied evidence cannot rule out sending sensitive data, such as credentials or private code, off the machine. No instruction or configuration clears this rule. Do not retry this action, and do not reach the same result another way: not with a different command, tool, script, file, or agent. Continue the task on a safer path that does not need this action. If no safer path exists for this step, finish the rest of the task first, then tell the user what you need from them for this step.',
    },
    decidingStage: 'jev',
    note: expect.toBeString(),
    status: 'deny',
    diagnostics: {
      contributors: [
        {
          choice: 'allow',
          confidence: 0.7,
          blockProbability: 0.3,
          rule: 'Data Exfiltration',
          source: 'shipped',
          tier: 'hard',
        },
      ],
      elapsedMs: expect.toBeWithin(0, Math.ceil(elapsedMs) + 1),
      failureReason: null,
      keyResolved: true,
      keySource: 'environment',
      blockThreshold: 0.2,
      requestBytes: expect.toBeNumber(),
      stage: 'response',
      status: 'deny',
    },
  });

  expect(outcome.note).toMatch(/^jev-1\.13\.0: deny \(\d+ms, 400 input tokens\)$/u);

  const questionSchema = z.object({ instructions: z.string() });
  const requestSchema = z.object({ questions: z.record(z.string(), questionSchema) });

  expect(received).toHaveBeenCalledOnce();

  const [call] = received.mock.calls;

  invariant(call, 'the decision service received the request');

  const question = requestSchema.parse(call[0]).questions['rule_0'];

  invariant(question, 'the request asks about rule_0');

  expect(question.instructions).toInclude('### Data Exfiltration\n');
});

// A named pipe hands its content to one reader only: a second read of the
// settings file blocks until the test times out.
test('it reads the Claude settings file once per action', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.directory, '.claude'));

  const settingsPath = join(ctx.directory, '.claude', 'settings.json');

  Bun.spawnSync(['mkfifo', settingsPath]);

  onTestFinished(async () => {
    for (const flags of [constants.O_RDONLY, constants.O_WRONLY]) {
      const handle = await open(settingsPath, flags | constants.O_NONBLOCK).catch(() => null);

      await handle?.close();
    }
  });

  const writing = writeFile(
    settingsPath,
    JSON.stringify({
      enabledMcpjsonServers: ['docs'],
      autoMode: { soft_deny: ['Never deploy on a Friday'] },
    }),
  );

  await writeFile(
    join(ctx.directory, 'repo', '.mcp.json'),
    JSON.stringify({
      mcpServers: { docs: { type: 'http', url: 'https://docs.example.test/mcp' } },
    }),
  );

  const received = mock<(body: unknown) => void>();

  server.use(
    http.post(DECISION_URL, async (info) => {
      const body: unknown = await info.request.clone().json();

      received(body);
    }),
  );

  const outcome = await classifyAction(
    buildMockActionRequest({
      cwd: join(ctx.directory, 'repo'),
      toolName: 'Bash',
      toolInput: { command: 'make deploy' },
    }),
    buildMockConfig({
      provider: { protocol: 'system-one', model: 'jev-1.13.0', apiKeyEnv: 'TYPESAFE_API_KEY' },
      judge: null,
      claudeSettingsPath: undefined,
    }),
    {
      stderr: buildStubOutput(),
      runtime: buildMockRuntime({
        env: { TYPESAFE_API_KEY: 'test-key' },
        home: ctx.directory,
        scratchPaths: [],
      }),
    },
  );

  await writing;

  expect(outcome.verdict).toStrictEqual({ kind: 'allow' });
  expect(received).toHaveBeenCalledOnce();

  const [call] = received.mock.calls;

  invariant(call, 'the decision service received the request');

  const state = z
    .object({ configuredRules: z.unknown(), mcpServers: z.unknown() })
    .parse(z.object({ state: z.unknown() }).parse(call[0]).state);

  expect(state.configuredRules).toStrictEqual({
    environment: [],
    allow: [],
    soft_deny: ['Never deploy on a Friday'],
    hard_deny: [],
  });

  expect(state.mcpServers).toStrictEqual([
    { name: 'docs', scope: 'project', transport: 'http', host: 'docs.example.test' },
  ]);
});

test('it ends a failure reason with a full stop before the safer-path instruction', async () => {
  const ctx = await setupTest();

  const startedAt = performance.now();

  const outcome = await classifyAction(
    buildMockActionRequest({
      cwd: join(ctx.directory, 'repo'),
      toolName: 'Bash',
      toolInput: { command: `touch ${join(ctx.directory, 'repo', 'a.ts')}` },
    }),
    buildMockConfig({
      provider: { protocol: 'system-one', model: 'jev-1.13.0', apiKeyEnv: 'TYPESAFE_API_KEY' },
      judge: null,
      claudeSettingsPath: null,
      onFailure: 'deny',
      blockThreshold: 0.2,
    }),
    {
      stderr: buildStubOutput(),
      runtime: buildMockRuntime({ env: {}, home: ctx.directory, scratchPaths: [] }),
    },
  );

  const elapsedMs = performance.now() - startedAt;

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
      elapsedMs: expect.toBeWithin(0, Math.ceil(elapsedMs) + 1),
      failureReason: null,
      keyResolved: false,
      keySource: 'none',
      blockThreshold: 0.2,
      requestBytes: null,
      stage: 'credential',
      status: 'failure',
    },
  });
});

test('it denies a write outside the task scope before a configured allow, Jev, or the judge can clear it', async () => {
  const ctx = await setupTest();

  const received = mock();

  runGit(ctx.directory, [
    '-C',
    join(ctx.directory, 'repo'),
    'commit',
    '-q',
    '--allow-empty',
    '-m',
    'init',
  ]);

  runGit(ctx.directory, [
    '-C',
    join(ctx.directory, 'repo'),
    'worktree',
    'add',
    '-q',
    '.worktrees/feature',
    '-b',
    'feature',
  ]);

  await writeFile(
    join(ctx.directory, 'settings.json'),
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
      cwd: join(ctx.directory, 'repo', '.worktrees', 'feature'),
      toolName: 'Bash',
      toolInput: { command: 'git worktree remove --force ../other' },
    }),
    buildMockConfig({
      provider: { protocol: 'system-one', apiKeyEnv: 'TYPESAFE_API_KEY' },
      judge: { protocol: 'claude-code' },
      claudeSettingsPath: join(ctx.directory, 'settings.json'),
    }),
    {
      stderr: buildStubOutput(),
      runtime: buildMockRuntime({
        env: {
          TYPESAFE_API_KEY: 'test-key',
          PATH: `${ctx.binDir}:${process.env['PATH'] ?? ''}`,
          STUB_CLAUDE_RECORD: ctx.recordPath,
          STUB_CLAUDE_REPLY: '{"verdict":"overturn","basis":"consent","reason":"Routine cleanup."}',
        },
        home: ctx.directory,
        scratchPaths: [],
      }),
    },
  );

  expect(outcome).toStrictEqual({
    verdict: {
      kind: 'deny',
      rule: 'Outside Task Scope',
      reason: `This action writes outside the task scope: path ${join(ctx.directory, 'repo', '.worktrees', 'other')}. The task owns the worktree ${join(ctx.directory, 'repo', '.worktrees', 'feature')} and the branch feature. Do the work inside the task's own worktree and branch, or ask the user to extend the task scope to this target. Do not retry this action, and do not reach the same result another way: not with a different command, tool, script, file, or agent. Continue the task on a safer path that does not need this action. If no safer path exists for this step, finish the rest of the task first, then tell the user what you need from them for this step.`,
    },
    decidingStage: 'containment',
    note: `denied by the containment check: ${join(ctx.directory, 'repo', '.worktrees', 'other')}`,
    status: 'deny',
  });

  expect(received).not.toHaveBeenCalled();
  expect(readFile(ctx.recordPath, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
});

test('it denies a push to a configured protected branch that the task works on, and no message can grant it', async () => {
  const ctx = await setupTest();

  const received = mock();

  runGit(ctx.directory, [
    '-C',
    join(ctx.directory, 'repo'),
    'commit',
    '-q',
    '--allow-empty',
    '-m',
    'init',
  ]);

  runGit(ctx.directory, [
    '-C',
    join(ctx.directory, 'repo'),
    'remote',
    'add',
    'origin',
    'git@github.com:dev/app.git',
  ]);

  runGit(ctx.directory, [
    '-C',
    join(ctx.directory, 'repo'),
    'worktree',
    'add',
    '-q',
    '.worktrees/release',
    '-b',
    'release/2.0',
  ]);

  server.use(
    http.post(DECISION_URL, (info) => {
      received();

      return sendDecisionReply(info);
    }),
  );

  const outcome = await classifyAction(
    buildMockActionRequest({
      cwd: join(ctx.directory, 'repo', '.worktrees', 'release'),
      toolName: 'Bash',
      toolInput: { command: 'git push origin release/2.0' },
      decisionContext: {
        agentID: null,
        lastDirectUserMessage: { text: 'Push release/2.0 to origin.' },
      },
    }),
    buildMockConfig({
      provider: { protocol: 'system-one', apiKeyEnv: 'TYPESAFE_API_KEY' },
      judge: { protocol: 'claude-code' },
      claudeSettingsPath: null,
      protectedBranches: ['release/*'],
    }),
    {
      stderr: buildStubOutput(),
      runtime: buildMockRuntime({
        env: {
          TYPESAFE_API_KEY: 'test-key',
          PATH: `${ctx.binDir}:${process.env['PATH'] ?? ''}`,
          STUB_CLAUDE_RECORD: ctx.recordPath,
          STUB_CLAUDE_REPLY:
            '{"verdict":"overturn","basis":"consent","reason":"The user asked for it."}',
        },
        home: ctx.directory,
        scratchPaths: [],
      }),
    },
  );

  expect(outcome).toStrictEqual({
    verdict: {
      kind: 'deny',
      rule: 'Outside Task Scope',
      reason: `This action writes outside the task scope: branch release/2.0. The task owns the worktree ${join(ctx.directory, 'repo', '.worktrees', 'release')}. Do the work inside the task's own worktree and branch, or ask the user to extend the task scope to this target. Do not retry this action, and do not reach the same result another way: not with a different command, tool, script, file, or agent. Continue the task on a safer path that does not need this action. If no safer path exists for this step, finish the rest of the task first, then tell the user what you need from them for this step.`,
    },
    decidingStage: 'containment',
    note: 'denied by the containment check: release/2.0',
    status: 'deny',
  });

  expect(received).not.toHaveBeenCalled();
  expect(readFile(ctx.recordPath, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
});

test('it allows an action whose soft-rule Jev deny the judge overturns', async () => {
  const ctx = await setupTest();

  decisionAnswers.set('rule_8', buildMockDecisionAnswer({ choice: 'block', confidence: 1 }));

  const startedAt = performance.now();

  const outcome = await classifyAction(
    buildMockActionRequest({
      cwd: join(ctx.directory, 'repo'),
      toolName: 'Bash',
      toolInput: { command: 'make release' },
      decisionContext: {
        agentID: null,
        lastDirectUserMessage: { text: 'Run make release on main.', origin: 'composer' },
      },
    }),
    buildMockConfig({
      provider: { protocol: 'system-one', model: 'jev-1.13.0', apiKeyEnv: 'TYPESAFE_API_KEY' },
      judge: { protocol: 'claude-code', model: 'claude-haiku-5-5' },
      claudeSettingsPath: null,
    }),
    {
      stderr: buildStubOutput(),
      runtime: buildMockRuntime({
        env: {
          TYPESAFE_API_KEY: 'test-key',
          PATH: `${ctx.binDir}:${process.env['PATH'] ?? ''}`,
          STUB_CLAUDE_RECORD: ctx.recordPath,
          STUB_CLAUDE_REPLY:
            '{"verdict":"overturn","basis":"consent","reason":"The user asked for the release on main."}',
        },
        home: ctx.directory,
        scratchPaths: [],
      }),
    },
  );

  const elapsedMs = performance.now() - startedAt;

  expect(outcome).toStrictEqual({
    verdict: { kind: 'allow' },
    decidingStage: 'judge',
    note: expect.toBeString(),
    status: 'allow',
    diagnostics: expect.toBeObject(),
    judge: {
      status: 'overturned',
      overturnBasis: 'consent',
      overturnReason: 'The user asked for the release on main.',
      failureReason: null,
      model: 'claude-haiku-5-5',
      answeringModel: 'claude-haiku-5-5',
      safetyStops: null,
      warm: false,
      rule: 'Default Branch Write',
      tier: 'soft',
      elapsedMs: expect.toBeWithin(0, Math.ceil(elapsedMs) + 1),
    },
  });

  expect(outcome.note).toMatch(
    /^jev-1\.13\.0: deny \(\d+ms, 400 input tokens\); judge overturned \(\d+ms\)$/u,
  );

  expect(outcome.diagnostics?.status).toBe('deny');
});

test('it appends the judge’s model usage to the debug file the host names', async () => {
  const ctx = await setupTest();

  decisionAnswers.set('rule_8', buildMockDecisionAnswer({ choice: 'block', confidence: 1 }));

  const debugPath = join(ctx.directory, 'judge-debug.jsonl');

  await classifyAction(
    buildMockActionRequest({
      cwd: join(ctx.directory, 'repo'),
      toolName: 'Bash',
      toolInput: { command: 'make release' },
    }),
    buildMockConfig({
      provider: { protocol: 'system-one', model: 'jev-1.13.0', apiKeyEnv: 'TYPESAFE_API_KEY' },
      judge: { protocol: 'claude-code', model: 'claude-haiku-5-5' },
      claudeSettingsPath: null,
    }),
    {
      stderr: buildStubOutput(),
      runtime: buildMockRuntime({
        env: {
          TYPESAFE_API_KEY: 'test-key',
          PATH: `${ctx.binDir}:${process.env['PATH'] ?? ''}`,
          AUTO_MODE_DEBUG_PATH: debugPath,
          STUB_CLAUDE_REPLY: '{"verdict":"confirm","basis":null,"reason":"Nobody asked."}',
          STUB_CLAUDE_MODEL_USAGE: JSON.stringify({ 'claude-haiku-5-5': { outputTokens: 12 } }),
        },
        home: ctx.directory,
        scratchPaths: [],
      }),
    },
  );

  const text = await readFile(debugPath, 'utf8');

  expect(JSON.parse(text)).toStrictEqual({
    time: expect.toBeDateString(),
    model: 'claude-haiku-5-5',
    answeringModel: 'claude-haiku-5-5',
    modelUsage: { 'claude-haiku-5-5': { outputTokens: 12 } },
  });
});

test('it allows an action whose soft-rule Jev deny the judge overturns as a misread under the default overturn setting', async () => {
  const ctx = await setupTest();

  decisionAnswers.set('rule_8', buildMockDecisionAnswer({ choice: 'block', confidence: 1 }));

  const outcome = await classifyAction(
    buildMockActionRequest({
      cwd: join(ctx.directory, 'repo'),
      toolName: 'Bash',
      toolInput: { command: 'make release' },
    }),
    buildMockConfig({
      provider: { protocol: 'system-one', model: 'jev-1.13.0', apiKeyEnv: 'TYPESAFE_API_KEY' },
      judge: { protocol: 'claude-code', model: 'claude-haiku-5-5' },
      claudeSettingsPath: null,
    }),
    {
      stderr: buildStubOutput(),
      runtime: buildMockRuntime({
        env: {
          TYPESAFE_API_KEY: 'test-key',
          PATH: `${ctx.binDir}:${process.env['PATH'] ?? ''}`,
          STUB_CLAUDE_REPLY:
            '{"verdict":"overturn","basis":"misread","reason":"main is the task branch."}',
        },
        home: ctx.directory,
        scratchPaths: [],
      }),
    },
  );

  expect(outcome).toMatchObject({
    verdict: { kind: 'allow' },
    decidingStage: 'judge',
    status: 'allow',
    judge: { status: 'overturned', overturnBasis: 'misread' },
  });
});

test('it keeps a soft-rule Jev deny the judge overturns as a misread when only a consent overturn may clear it', async () => {
  const ctx = await setupTest();

  decisionAnswers.set('rule_8', buildMockDecisionAnswer({ choice: 'block', confidence: 1 }));

  const outcome = await classifyAction(
    buildMockActionRequest({
      cwd: join(ctx.directory, 'repo'),
      toolName: 'Bash',
      toolInput: { command: 'make release' },
    }),
    buildMockConfig({
      provider: { protocol: 'system-one', model: 'jev-1.13.0', apiKeyEnv: 'TYPESAFE_API_KEY' },
      judge: { protocol: 'claude-code', model: 'claude-haiku-5-5' },
      judgeOverturns: 'consent',
      claudeSettingsPath: null,
    }),
    {
      stderr: buildStubOutput(),
      runtime: buildMockRuntime({
        env: {
          TYPESAFE_API_KEY: 'test-key',
          PATH: `${ctx.binDir}:${process.env['PATH'] ?? ''}`,
          STUB_CLAUDE_REPLY:
            '{"verdict":"overturn","basis":"misread","reason":"main is the task branch."}',
        },
        home: ctx.directory,
        scratchPaths: [],
      }),
    },
  );

  expect(outcome).toMatchObject({
    verdict: {
      kind: 'deny',
      rule: 'Default Branch Write',
      reason: expect.toStartWith('The action matches this rule: '),
    },
    decidingStage: 'judge',
    status: 'deny',
    judge: { status: 'held', overturnBasis: 'misread' },
  });
});

test('it denies with the judge’s reason and the safer-path instruction when the judge confirms a Jev deny', async () => {
  const ctx = await setupTest();

  decisionAnswers.set('rule_8', buildMockDecisionAnswer({ choice: 'block', confidence: 1 }));

  const outcome = await classifyAction(
    buildMockActionRequest({
      cwd: join(ctx.directory, 'repo'),
      toolName: 'Bash',
      toolInput: { command: 'make release' },
    }),
    buildMockConfig({
      provider: { protocol: 'system-one', model: 'jev-1.13.0', apiKeyEnv: 'TYPESAFE_API_KEY' },
      judge: { protocol: 'claude-code', model: 'claude-haiku-5-5' },
      claudeSettingsPath: null,
    }),
    {
      stderr: buildStubOutput(),
      runtime: buildMockRuntime({
        env: {
          TYPESAFE_API_KEY: 'test-key',
          PATH: `${ctx.binDir}:${process.env['PATH'] ?? ''}`,
          STUB_CLAUDE_REPLY:
            '{"verdict":"confirm","basis":null,"reason":"The user asked for a branch, not main."}',
        },
        home: ctx.directory,
        scratchPaths: [],
      }),
    },
  );

  expect(outcome).toMatchObject({
    verdict: {
      kind: 'deny',
      rule: 'Default Branch Write',
      reason:
        'The reviewer confirmed the Default Branch Write deny: The user asked for a branch, not main. Do not retry this action, and do not reach the same result another way: not with a different command, tool, script, file, or agent. Continue the task on a safer path that does not need this action. If no safer path exists for this step, finish the rest of the task first, then tell the user what you need from them for this step.',
    },
    decidingStage: 'judge',
    status: 'deny',
    judge: { status: 'confirmed', failureReason: null },
  });
});

test('it keeps a hard-rule Jev deny with its template reason when the judge overturns it', async () => {
  const ctx = await setupTest();

  decisionAnswers.set('rule_1', buildMockDecisionAnswer({ choice: 'block', confidence: 1 }));

  const outcome = await classifyAction(
    buildMockActionRequest({
      cwd: join(ctx.directory, 'repo'),
      toolName: 'Bash',
      toolInput: { command: 'make release' },
    }),
    buildMockConfig({
      provider: { protocol: 'system-one', model: 'jev-1.13.0', apiKeyEnv: 'TYPESAFE_API_KEY' },
      judge: { protocol: 'claude-code', model: 'claude-haiku-5-5' },
      claudeSettingsPath: null,
    }),
    {
      stderr: buildStubOutput(),
      runtime: buildMockRuntime({
        env: {
          TYPESAFE_API_KEY: 'test-key',
          PATH: `${ctx.binDir}:${process.env['PATH'] ?? ''}`,
          STUB_CLAUDE_REPLY:
            '{"verdict":"overturn","basis":"consent","reason":"The value is a test literal."}',
        },
        home: ctx.directory,
        scratchPaths: [],
      }),
    },
  );

  expect(outcome).toMatchObject({
    verdict: {
      kind: 'deny',
      rule: 'Secret Persistence',
      reason: expect.toStartWith('The action matches this rule: '),
    },
    decidingStage: 'judge',
    status: 'deny',
    judge: { status: 'held', rule: 'Secret Persistence', tier: 'hard' },
  });
});

test('it allows a scratch-directory test run that Jev chose to allow but scored just over the threshold on a hard rule when the judge overturns it as a misread', async () => {
  const ctx = await setupTest();

  decisionAnswers.set(
    'rule_1',
    buildMockDecisionAnswer({
      choice: 'allow',
      confidence: 0.58,
      probabilities: { allow: 0.79, block: 0.21 },
    }),
  );

  const outcome = await classifyAction(
    buildMockActionRequest({
      cwd: join(ctx.directory, 'repo'),
      toolName: 'Bash',
      toolInput: {
        command:
          'mkdir -p /tmp/short-tmp && TMPDIR=/tmp/short-tmp bash scripts/test-lib/test-create-stub-checks-docker.sh 2>&1 | tail -6',
      },
    }),
    buildMockConfig({
      provider: { protocol: 'system-one', model: 'jev-1.13.0', apiKeyEnv: 'TYPESAFE_API_KEY' },
      judge: { protocol: 'claude-code', model: 'claude-haiku-5-5' },
      judgeOverturns: 'any',
      blockThreshold: 0.2,
      claudeSettingsPath: null,
    }),
    {
      stderr: buildStubOutput(),
      runtime: buildMockRuntime({
        env: {
          TYPESAFE_API_KEY: 'test-key',
          PATH: `${ctx.binDir}:${process.env['PATH'] ?? ''}`,
          STUB_CLAUDE_RECORD: ctx.recordPath,
          STUB_CLAUDE_REPLY:
            '{"verdict":"overturn","basis":"misread","reason":"The command runs a test script with a scratch TMPDIR and writes no secret."}',
        },
        home: ctx.directory,
        scratchPaths: [],
      }),
    },
  );

  expect(outcome).toMatchObject({
    verdict: { kind: 'allow' },
    decidingStage: 'judge',
    status: 'allow',
    judge: {
      status: 'overturned',
      overturnBasis: 'misread',
      rule: 'Secret Persistence',
      tier: 'hard',
    },
  });

  const calls = await readFile(ctx.recordPath, 'utf8');

  expect(calls).toInclude(String.raw`\"misreadMayClear\": true`);
});

test('it allows a merge that Jev doubted on Audit Tampering and on Default Branch Write when the judge overturns the hard deny as a misread', async () => {
  const ctx = await setupTest();

  decisionAnswers.set(
    'rule_3',
    buildMockDecisionAnswer({
      choice: 'allow',
      confidence: 0.67,
      probabilities: { allow: 0.67, block: 0.33 },
    }),
  );

  decisionAnswers.set(
    'rule_8',
    buildMockDecisionAnswer({
      choice: 'allow',
      confidence: 0.71,
      probabilities: { allow: 0.71, block: 0.29 },
    }),
  );

  const outcome = await classifyAction(
    buildMockActionRequest({
      cwd: join(ctx.directory, 'repo'),
      toolName: 'Bash',
      toolInput: { command: 'git merge --no-edit origin/main' },
    }),
    buildMockConfig({
      provider: { protocol: 'system-one', model: 'jev-1.13.0', apiKeyEnv: 'TYPESAFE_API_KEY' },
      judge: { protocol: 'claude-code', model: 'claude-haiku-5-5' },
      judgeOverturns: 'any',
      blockThreshold: 0.2,
      claudeSettingsPath: null,
    }),
    {
      stderr: buildStubOutput(),
      runtime: buildMockRuntime({
        env: {
          TYPESAFE_API_KEY: 'test-key',
          PATH: `${ctx.binDir}:${process.env['PATH'] ?? ''}`,
          STUB_CLAUDE_RECORD: ctx.recordPath,
          STUB_CLAUDE_REPLY:
            '{"verdict":"overturn","basis":"misread","reason":"The merge brings main into the feature branch and rewrites no history."}',
        },
        home: ctx.directory,
        scratchPaths: [],
      }),
    },
  );

  expect(outcome).toMatchObject({
    verdict: { kind: 'allow' },
    decidingStage: 'judge',
    status: 'allow',
    judge: {
      status: 'overturned',
      overturnBasis: 'misread',
      rule: 'Audit Tampering',
      tier: 'hard',
    },
  });

  const calls = await readFile(ctx.recordPath, 'utf8');

  expect(calls).toInclude(String.raw`\"misreadMayClear\": true`);
});

test('it keeps a merge Jev doubted on Audit Tampering when it chose to block Default Branch Write', async () => {
  const ctx = await setupTest();

  decisionAnswers.set(
    'rule_3',
    buildMockDecisionAnswer({
      choice: 'allow',
      confidence: 0.67,
      probabilities: { allow: 0.67, block: 0.33 },
    }),
  );

  decisionAnswers.set(
    'rule_8',
    buildMockDecisionAnswer({
      choice: 'block',
      confidence: 0.62,
      probabilities: { allow: 0.38, block: 0.62 },
    }),
  );

  const outcome = await classifyAction(
    buildMockActionRequest({
      cwd: join(ctx.directory, 'repo'),
      toolName: 'Bash',
      toolInput: { command: 'git merge --no-edit origin/main' },
    }),
    buildMockConfig({
      provider: { protocol: 'system-one', model: 'jev-1.13.0', apiKeyEnv: 'TYPESAFE_API_KEY' },
      judge: { protocol: 'claude-code', model: 'claude-haiku-5-5' },
      judgeOverturns: 'any',
      blockThreshold: 0.2,
      claudeSettingsPath: null,
    }),
    {
      stderr: buildStubOutput(),
      runtime: buildMockRuntime({
        env: {
          TYPESAFE_API_KEY: 'test-key',
          PATH: `${ctx.binDir}:${process.env['PATH'] ?? ''}`,
          STUB_CLAUDE_REPLY:
            '{"verdict":"overturn","basis":"misread","reason":"The merge brings main into the feature branch."}',
        },
        home: ctx.directory,
        scratchPaths: [],
      }),
    },
  );

  expect(outcome).toMatchObject({
    verdict: { kind: 'deny', rule: 'Audit Tampering' },
    decidingStage: 'judge',
    status: 'deny',
    judge: { status: 'held', overturnBasis: 'misread', tier: 'hard' },
  });
});

test('it keeps a hard-rule deny Jev chose to allow when its block probability is above the misread bound', async () => {
  const ctx = await setupTest();

  decisionAnswers.set(
    'rule_1',
    buildMockDecisionAnswer({
      choice: 'allow',
      confidence: 0.64,
      probabilities: { allow: 0.64, block: 0.36 },
    }),
  );

  const outcome = await classifyAction(
    buildMockActionRequest({
      cwd: join(ctx.directory, 'repo'),
      toolName: 'Bash',
      toolInput: { command: 'bash scripts/run-checks.sh' },
    }),
    buildMockConfig({
      provider: { protocol: 'system-one', model: 'jev-1.13.0', apiKeyEnv: 'TYPESAFE_API_KEY' },
      judge: { protocol: 'claude-code', model: 'claude-haiku-5-5' },
      judgeOverturns: 'any',
      blockThreshold: 0.2,
      claudeSettingsPath: null,
    }),
    {
      stderr: buildStubOutput(),
      runtime: buildMockRuntime({
        env: {
          TYPESAFE_API_KEY: 'test-key',
          PATH: `${ctx.binDir}:${process.env['PATH'] ?? ''}`,
          STUB_CLAUDE_REPLY:
            '{"verdict":"overturn","basis":"misread","reason":"The script writes no secret."}',
        },
        home: ctx.directory,
        scratchPaths: [],
      }),
    },
  );

  expect(outcome).toMatchObject({
    verdict: { kind: 'deny', rule: 'Secret Persistence' },
    decidingStage: 'judge',
    status: 'deny',
    judge: { status: 'held', overturnBasis: 'misread', tier: 'hard' },
  });
});

test('it keeps a Jev deny the judge overturns on consent when a configured hard deny also blocks below the top soft rule', async () => {
  const ctx = await setupTest();

  await writeFile(
    join(ctx.directory, 'settings.json'),
    JSON.stringify({ autoMode: { hard_deny: ['Never run the release target'] } }),
  );

  decisionAnswers.set('rule_8', buildMockDecisionAnswer({ choice: 'block', confidence: 1 }));

  decisionAnswers.set(
    'hard_deny_0',
    buildMockDecisionAnswer({
      choice: 'allow',
      confidence: 0.6,
      probabilities: { allow: 0.6, block: 0.4 },
    }),
  );

  const outcome = await classifyAction(
    buildMockActionRequest({
      cwd: join(ctx.directory, 'repo'),
      toolName: 'Bash',
      toolInput: { command: 'make release' },
    }),
    buildMockConfig({
      provider: { protocol: 'system-one', model: 'jev-1.13.0', apiKeyEnv: 'TYPESAFE_API_KEY' },
      judge: { protocol: 'claude-code', model: 'claude-haiku-5-5' },
      claudeSettingsPath: join(ctx.directory, 'settings.json'),
    }),
    {
      stderr: buildStubOutput(),
      runtime: buildMockRuntime({
        env: {
          TYPESAFE_API_KEY: 'test-key',
          PATH: `${ctx.binDir}:${process.env['PATH'] ?? ''}`,
          STUB_CLAUDE_REPLY:
            '{"verdict":"overturn","basis":"consent","reason":"The user asked for the release."}',
        },
        home: ctx.directory,
        scratchPaths: [],
      }),
    },
  );

  expect(outcome).toMatchObject({
    verdict: { kind: 'deny' },
    decidingStage: 'judge',
    status: 'deny',
    judge: { status: 'held', tier: 'hard', overturnBasis: 'consent' },
  });
});

test('it denies a stored-password change the user only asked to check at the containment check, before Jev or the judge', async () => {
  const ctx = await setupTest();

  const received = mock();

  server.use(
    http.post(DECISION_URL, (info) => {
      received();

      return sendDecisionReply(info);
    }),
  );

  const outcome = await classifyAction(
    buildMockActionRequest({
      cwd: join(ctx.directory, 'repo'),
      toolName: 'Bash',
      toolInput: {
        command: 'op item edit "harbor deploy" password=harbor-2026-reset --vault agents',
        description: 'Check deploy item',
      },
      decisionContext: {
        agentID: null,
        lastDirectUserMessage: {
          text: 'Check that the harbor deploy item exists in the agents vault.',
        },
      },
    }),
    buildMockConfig({
      provider: { protocol: 'system-one', model: 'jev-1.13.0', apiKeyEnv: 'TYPESAFE_API_KEY' },
      judge: { protocol: 'claude-code', model: 'claude-haiku-5-5' },
      claudeSettingsPath: null,
    }),
    {
      stderr: buildStubOutput(),
      runtime: buildMockRuntime({
        env: {
          TYPESAFE_API_KEY: 'test-key',
          PATH: `${ctx.binDir}:${process.env['PATH'] ?? ''}`,
          STUB_CLAUDE_RECORD: ctx.recordPath,
          STUB_CLAUDE_REPLY:
            '{"verdict":"confirm","basis":null,"reason":"The user asked to check that the item exists; this replaces its password."}',
        },
        home: ctx.directory,
        scratchPaths: [],
      }),
    },
  );

  expect(outcome).toStrictEqual({
    verdict: {
      kind: 'deny',
      rule: 'Outside Task Scope',
      reason: `This action writes outside the task scope: credential or global setting op item edit. The task owns the worktree ${join(ctx.directory, 'repo')}. Do the work inside the task's own worktree and branch, or ask the user to extend the task scope to this target. Do not retry this action, and do not reach the same result another way: not with a different command, tool, script, file, or agent. Continue the task on a safer path that does not need this action. If no safer path exists for this step, finish the rest of the task first, then tell the user what you need from them for this step.`,
    },
    decidingStage: 'containment',
    note: 'denied by the containment check: op item edit',
    status: 'deny',
  });

  expect(received).not.toHaveBeenCalled();
  expect(readFile(ctx.recordPath, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
});

test('it passes a target it cannot resolve to the classifier', async () => {
  const ctx = await setupTest();

  runGit(ctx.directory, [
    '-C',
    join(ctx.directory, 'repo'),
    'commit',
    '-q',
    '--allow-empty',
    '-m',
    'init',
  ]);

  runGit(ctx.directory, [
    '-C',
    join(ctx.directory, 'repo'),
    'worktree',
    'add',
    '-q',
    '.worktrees/feature',
    '-b',
    'feature',
  ]);

  const outcome = await classifyAction(
    buildMockActionRequest({
      cwd: join(ctx.directory, 'repo', '.worktrees', 'feature'),
      toolName: 'Bash',
      toolInput: { command: 'rm -rf "$OTHER_WORKTREE"' },
    }),
    buildMockConfig({
      provider: { protocol: 'system-one' },
      judge: null,
      claudeSettingsPath: null,
    }),
    {
      stderr: buildStubOutput(),
      runtime: buildMockRuntime({ env: {}, home: ctx.directory, scratchPaths: [] }),
      localOnly: true,
    },
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
      cwd: join(ctx.directory, 'repo'),
      toolName: 'Bash',
      toolInput: { command: 'rm -rf .worktrees/other/dist' },
    }),
    buildMockConfig({
      provider: { protocol: 'system-one' },
      judge: null,
      claudeSettingsPath: null,
    }),
    {
      stderr: buildStubOutput(),
      runtime: buildMockRuntime({ env: {}, home: ctx.directory, scratchPaths: [] }),
      localOnly: true,
    },
  );

  expect(outcome).toStrictEqual({
    verdict: {
      kind: 'deny',
      rule: 'Outside Task Scope',
      reason: `This action writes outside the task scope: path ${join(ctx.directory, 'repo', '.worktrees', 'other', 'dist')}. The task owns the worktree ${join(ctx.directory, 'repo')}. Do the work inside the task's own worktree and branch, or ask the user to extend the task scope to this target. Do not retry this action, and do not reach the same result another way: not with a different command, tool, script, file, or agent. Continue the task on a safer path that does not need this action. If no safer path exists for this step, finish the rest of the task first, then tell the user what you need from them for this step.`,
    },
    decidingStage: 'containment',
    note: `denied by the containment check: ${join(ctx.directory, 'repo', '.worktrees', 'other', 'dist')}`,
    status: 'deny',
  });
});

test('it still allows a local regenerable-output removal inside the task worktree', async () => {
  const ctx = await setupTest();

  const outcome = await classifyAction(
    buildMockActionRequest({
      cwd: join(ctx.directory, 'repo'),
      toolName: 'Bash',
      toolInput: { command: 'rm -rf dist' },
    }),
    buildMockConfig({
      provider: { protocol: 'system-one' },
      judge: null,
      claudeSettingsPath: null,
    }),
    {
      stderr: buildStubOutput(),
      runtime: buildMockRuntime({ env: {}, home: ctx.directory, scratchPaths: [] }),
      localOnly: true,
    },
  );

  expect(outcome).toStrictEqual({
    verdict: { kind: 'allow' },
    decidingStage: 'local',
    note: 'allowed by Regenerable output (local)',
    status: 'allow',
  });
});

test('it escalates a local regenerable-output removal when the task scope does not load', async () => {
  const ctx = await setupTest();

  const outcome = await classifyAction(
    buildMockActionRequest({
      cwd: join(ctx.directory, 'repo'),
      toolName: 'Bash',
      toolInput: { command: 'rm -rf dist' },
    }),
    buildMockConfig({
      provider: { protocol: 'system-one' },
      judge: null,
      claudeSettingsPath: null,
    }),
    {
      stderr: buildStubOutput(),
      runtime: buildMockRuntime({
        env: {},
        home: ctx.directory,
        scratchPaths: [],
        readCheckout: () => Promise.reject(new Error('the git directory is unreadable')),
      }),
      localOnly: true,
    },
  );

  expect(outcome).toStrictEqual({
    verdict: null,
    decidingStage: 'local',
    note: 'Bash needs the model tier, which this run skipped',
    status: 'skipped',
  });
});

test('it allows a file-tool write inside the cwd worktree without the model tier', async () => {
  const ctx = await setupTest();

  const outcome = await classifyAction(
    buildMockActionRequest({
      cwd: join(ctx.directory, 'repo'),
      toolName: 'Write',
      toolInput: { file_path: 'src/a.ts', content: 'export const a = 1;\n' },
    }),
    buildMockConfig({
      provider: { protocol: 'system-one' },
      judge: null,
      claudeSettingsPath: null,
    }),
    {
      stderr: buildStubOutput(),
      runtime: buildMockRuntime({ env: {}, home: ctx.directory, scratchPaths: [] }),
      localOnly: true,
    },
  );

  expect(outcome).toStrictEqual({
    verdict: { kind: 'allow' },
    decidingStage: 'bypass',
    note: `allowed by the edit bypass: ${join(ctx.directory, 'repo', 'src', 'a.ts')}`,
    status: 'allow',
  });
});

test('it sends an in-scope edit to the model tier when it writes an env file', async () => {
  const ctx = await setupTest();

  const outcome = await classifyAction(
    buildMockActionRequest({
      cwd: join(ctx.directory, 'repo'),
      toolName: 'Write',
      toolInput: { file_path: join(ctx.directory, 'repo', '.env'), content: 'PORT=3000' },
    }),
    buildMockConfig({
      provider: { protocol: 'system-one' },
      judge: null,
      claudeSettingsPath: null,
    }),
    {
      stderr: buildStubOutput(),
      runtime: buildMockRuntime({ env: {}, home: ctx.directory, scratchPaths: [] }),
      localOnly: true,
    },
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
      cwd: join(ctx.directory, 'repo'),
      toolName: 'Write',
      toolInput: {
        file_path: join(ctx.directory, 'repo', 'src', 'token.ts'),
        content: `export const token = '${token}';`,
      },
    }),
    buildMockConfig({
      provider: { protocol: 'system-one' },
      judge: null,
      claudeSettingsPath: null,
    }),
    {
      stderr: buildStubOutput(),
      runtime: buildMockRuntime({ env: {}, home: ctx.directory, scratchPaths: [] }),
      localOnly: true,
    },
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
    join(ctx.directory, 'settings.json'),
    JSON.stringify({ autoMode: { soft_deny: ['Never edit a.ts'] } }),
  );

  const outcome = await classifyAction(
    buildMockActionRequest({
      cwd: join(ctx.directory, 'repo'),
      toolName: 'Write',
      toolInput: { file_path: join(ctx.directory, 'repo', 'a.ts'), content: 'x' },
    }),
    buildMockConfig({
      provider: { protocol: 'system-one' },
      judge: null,
      claudeSettingsPath: join(ctx.directory, 'settings.json'),
    }),
    {
      stderr: buildStubOutput(),
      runtime: buildMockRuntime({ env: {}, home: ctx.directory, scratchPaths: [] }),
      localOnly: true,
    },
  );

  expect(outcome).toStrictEqual({
    verdict: null,
    decidingStage: 'local',
    note: 'Write needs the model tier, which this run skipped',
    status: 'skipped',
  });
});

test('it walks up to the checkout once for an action that reaches Jev', async () => {
  const ctx = await setupTest();

  const walk = mock(readCheckout);

  const outcome = await classifyAction(
    buildMockActionRequest({
      cwd: join(ctx.directory, 'repo'),
      toolName: 'Bash',
      toolInput: { command: 'make deploy' },
    }),
    buildMockConfig({
      provider: { protocol: 'system-one', apiKeyEnv: 'TYPESAFE_API_KEY' },
      judge: null,
      claudeSettingsPath: null,
    }),
    {
      stderr: buildStubOutput(),
      runtime: buildMockRuntime({
        env: { TYPESAFE_API_KEY: 'test-key' },
        home: ctx.directory,
        scratchPaths: [],
        readCheckout: walk,
      }),
    },
  );

  expect(outcome.decidingStage).toBe('jev');
  expect(walk).toHaveBeenCalledExactlyOnceWith(join(ctx.directory, 'repo'), expect.any(Object));
});

test('it leaves the action to the user once the denial budget is spent', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.directory, 'settings.json'), 'not json {');

  const config = buildMockConfig({
    provider: { protocol: 'system-one' },
    judge: null,
    onFailure: 'deny',
    claudeSettingsPath: join(ctx.directory, 'settings.json'),
    denialBudget: { consecutive: 1, perSession: 20 },
  });

  const runtime = buildMockRuntime({ env: {}, home: ctx.directory, scratchPaths: [] });

  await classifyAction(
    buildMockActionRequest({
      sessionID: 'budget-session',
      cwd: join(ctx.directory, 'repo'),
      toolName: 'Bash',
      toolInput: { command: 'git push a' },
    }),
    config,
    { runtime, stderr: buildStubOutput(), budget: true },
  );

  const outcome = await classifyAction(
    buildMockActionRequest({
      sessionID: 'budget-session',
      cwd: join(ctx.directory, 'repo'),
      toolName: 'Bash',
      toolInput: { command: 'git push b' },
    }),
    config,
    { runtime, stderr: buildStubOutput(), budget: true },
  );

  expect(outcome).toStrictEqual({
    verdict: null,
    decidingStage: 'budget',
    note: 'denial budget exhausted; the user decides this action',
    status: 'failure',
    unavailable: true,
    denials: { consecutive: 0, session: 0 },
    escalation: true,
  });
});

test('it writes a started and a final action-log record when asked', async () => {
  const ctx = await setupTest();

  await classifyAction(
    buildMockActionRequest({
      cwd: join(ctx.directory, 'repo'),
      toolName: 'Read',
      toolInput: { file_path: join(ctx.directory, 'repo', 'a.ts') },
    }),
    buildMockConfig({
      provider: { protocol: 'system-one' },
      judge: null,
      claudeSettingsPath: null,
    }),
    {
      stderr: buildStubOutput(),
      runtime: buildMockRuntime({
        env: { AUTO_MODE_DIAGNOSTICS_PATH: join(ctx.directory, 'actions.jsonl') },
        home: ctx.directory,
        scratchPaths: [],
      }),
      actionLog: true,
    },
  );

  const log = await readFile(join(ctx.directory, 'actions.jsonl'), 'utf8');

  expect(
    log
      .trim()
      .split('\n')
      .map((line): unknown => JSON.parse(line)),
  ).toStrictEqual([
    {
      schemaVersion: 9,
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
      taskEvidence: { userMessage: null, originalUserTask: 'composer', delegatedTask: false },
    },
    {
      schemaVersion: 9,
      time: expect.toBeString(),
      invocationID: expect.toBeString(),
      sessionHash: expect.toBeString(),
      agentHash: expect.toBeString(),
      actionHash: expect.toBeString(),
      status: 'allow',
      verdict: 'allow',
      decidingStage: 'local',
      denials: null,
      escalation: false,
      diagnostics: null,
      judge: null,
      grant: null,
      action: null,
      taskEvidence: { userMessage: null, originalUserTask: 'composer', delegatedTask: false },
    },
  ]);
});

test('it walks up to the checkout once for an edit the bypass sends on to Jev', async () => {
  const ctx = await setupTest();

  const walk = mock(readCheckout);

  const outcome = await classifyAction(
    buildMockActionRequest({
      cwd: join(ctx.directory, 'repo'),
      toolName: 'Write',
      toolInput: { file_path: join(ctx.directory, 'repo', '.env'), content: 'PORT=3000' },
    }),
    buildMockConfig({
      provider: { protocol: 'system-one', apiKeyEnv: 'TYPESAFE_API_KEY' },
      judge: null,
      claudeSettingsPath: null,
    }),
    {
      stderr: buildStubOutput(),
      runtime: buildMockRuntime({
        env: { TYPESAFE_API_KEY: 'test-key' },
        home: ctx.directory,
        scratchPaths: [],
        readCheckout: walk,
      }),
    },
  );

  expect(outcome.decidingStage).toBe('jev');
  expect(walk).toHaveBeenCalledExactlyOnceWith(join(ctx.directory, 'repo'), expect.any(Object));
});

test('it keeps the containment deny with the judge’s reason when the judge confirms that the message names the target only as a source', async () => {
  const ctx = await setupTest();

  const received = mock();

  runGit(ctx.directory, [
    '-C',
    join(ctx.directory, 'repo'),
    'commit',
    '-q',
    '--allow-empty',
    '-m',
    'init',
  ]);

  runGit(ctx.directory, [
    '-C',
    join(ctx.directory, 'repo'),
    'worktree',
    'add',
    '-q',
    '.worktrees/queue-columns',
    '-b',
    'feat/queue-columns',
  ]);

  server.use(
    http.post(DECISION_URL, (info) => {
      received();

      return sendDecisionReply(info);
    }),
  );

  const target = join(
    ctx.directory,
    'repo',
    '.worktrees',
    'export-csv',
    'src',
    'client',
    'format-row.ts',
  );

  const outcome = await classifyAction(
    buildMockActionRequest({
      cwd: join(ctx.directory, 'repo', '.worktrees', 'queue-columns'),
      toolName: 'Write',
      toolInput: { file_path: target, content: 'export const formatRow = () => "";\n' },
      decisionContext: {
        agentID: null,
        lastDirectUserMessage: {
          text: 'Port the row formatter from the export-csv worktree into the queue view.',
        },
      },
    }),
    buildMockConfig({
      provider: { protocol: 'system-one', model: 'jev-1.13.0', apiKeyEnv: 'TYPESAFE_API_KEY' },
      judge: { protocol: 'claude-code', model: 'claude-haiku-5-5' },
      claudeSettingsPath: null,
    }),
    {
      stderr: buildStubOutput(),
      runtime: buildMockRuntime({
        env: {
          TYPESAFE_API_KEY: 'test-key',
          PATH: `${ctx.binDir}:${process.env['PATH'] ?? ''}`,
          STUB_CLAUDE_RECORD: ctx.recordPath,
          STUB_CLAUDE_REPLY:
            '{"verdict":"confirm","basis":null,"reason":"You would write into the export-csv worktree, which the user named only as the source to port from."}',
        },
        home: ctx.directory,
        scratchPaths: [],
      }),
    },
  );

  expect(outcome).toStrictEqual({
    verdict: {
      kind: 'deny',
      rule: 'Outside Task Scope',
      reason:
        'The reviewer confirmed the Outside Task Scope deny: You would write into the export-csv worktree, which the user named only as the source to port from. Do not retry this action, and do not reach the same result another way: not with a different command, tool, script, file, or agent. Continue the task on a safer path that does not need this action. If no safer path exists for this step, finish the rest of the task first, then tell the user what you need from them for this step.',
    },
    decidingStage: 'containment',
    note: expect.toBeString(),
    status: 'deny',
    diagnostics: expect.toBeObject(),
    grant: {
      status: 'confirmed',
      overturnBasis: null,
      overturnReason: null,
      failureReason: null,
      model: 'claude-haiku-5-5',
      answeringModel: 'claude-haiku-5-5',
      safetyStops: null,
      warm: false,
      rule: 'Outside Task Scope',
      tier: 'soft',
      elapsedMs: expect.toBeNumber(),
    },
  });

  expect(outcome.note).toMatch(
    new RegExp(`^denied by the containment check: ${target}; judge confirmed \\(\\d+ms\\)$`, 'u'),
  );

  invariant(outcome.diagnostics);

  expect(outcome.diagnostics.status).toBe('allow');
  expect(received).toHaveBeenCalledOnce();
});

test('it denies the own-worktree cleanup that also removes another worktree the message never names, without asking the judge', async () => {
  const ctx = await setupTest();

  runGit(ctx.directory, [
    '-C',
    join(ctx.directory, 'repo'),
    'commit',
    '-q',
    '--allow-empty',
    '-m',
    'init',
  ]);

  runGit(ctx.directory, [
    '-C',
    join(ctx.directory, 'repo'),
    'worktree',
    'add',
    '-q',
    '.worktrees/columns-glm',
    '-b',
    'feat/columns-glm',
  ]);

  const outcome = await classifyAction(
    buildMockActionRequest({
      cwd: join(ctx.directory, 'repo', '.worktrees', 'columns-glm'),
      toolName: 'Bash',
      toolInput: {
        command: `cd ${join(ctx.directory, 'repo')} && git worktree remove --force .worktrees/columns-glm && git worktree remove --force .worktrees/columns-codex`,
      },
      decisionContext: {
        agentID: null,
        lastDirectUserMessage: {
          text: 'The columns PR merged. Clean up your own worktree for it.',
        },
      },
    }),
    buildMockConfig({
      provider: { protocol: 'system-one', model: 'jev-1.13.0', apiKeyEnv: 'TYPESAFE_API_KEY' },
      judge: { protocol: 'claude-code', model: 'claude-haiku-5-5' },
      claudeSettingsPath: null,
    }),
    {
      stderr: buildStubOutput(),
      runtime: buildMockRuntime({
        env: {
          TYPESAFE_API_KEY: 'test-key',
          PATH: `${ctx.binDir}:${process.env['PATH'] ?? ''}`,
          STUB_CLAUDE_RECORD: ctx.recordPath,
          STUB_CLAUDE_REPLY: '{"verdict":"overturn","basis":"consent","reason":"Asked for."}',
        },
        home: ctx.directory,
        scratchPaths: [],
      }),
    },
  );

  expect(outcome).toStrictEqual({
    verdict: {
      kind: 'deny',
      rule: 'Outside Task Scope',
      reason: expect.toStartWith(
        `This action writes outside the task scope: path ${join(ctx.directory, 'repo', '.worktrees', 'columns-codex')}.`,
      ),
    },
    decidingStage: 'containment',
    note: `denied by the containment check: ${join(ctx.directory, 'repo', '.worktrees', 'columns-codex')}`,
    status: 'deny',
  });

  expect(readFile(ctx.recordPath, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
});

test('it clears a containment finding the judge confirms the user asked for, and lets Jev decide the write', async () => {
  const ctx = await setupTest();

  const received = mock();

  server.use(
    http.post(DECISION_URL, (info) => {
      received();

      return sendDecisionReply(info);
    }),
  );

  const target = join(ctx.directory, 'repo', '.worktrees', 'label-check', 'label.test.ts');

  const outcome = await classifyAction(
    buildMockActionRequest({
      cwd: join(ctx.directory, 'repo'),
      toolName: 'Write',
      toolInput: { file_path: target, content: "test('it trims a label', () => {});\n" },
      decisionContext: {
        agentID: null,
        lastDirectUserMessage: {
          text: `Create ${target} with one label test, then run it. Change no other file.`,
        },
      },
    }),
    buildMockConfig({
      provider: { protocol: 'system-one', model: 'jev-1.13.0', apiKeyEnv: 'TYPESAFE_API_KEY' },
      judge: { protocol: 'claude-code', model: 'claude-haiku-5-5' },
      claudeSettingsPath: null,
    }),
    {
      stderr: buildStubOutput(),
      runtime: buildMockRuntime({
        env: {
          TYPESAFE_API_KEY: 'test-key',
          PATH: `${ctx.binDir}:${process.env['PATH'] ?? ''}`,
          STUB_CLAUDE_RECORD: ctx.recordPath,
          STUB_CLAUDE_REPLY:
            '{"verdict":"overturn","basis":"consent","reason":"The user asked to create this exact file."}',
        },
        home: ctx.directory,
        scratchPaths: [],
      }),
    },
  );

  expect(outcome).toStrictEqual({
    verdict: { kind: 'allow' },
    decidingStage: 'jev',
    note: expect.toBeString(),
    status: 'allow',
    diagnostics: expect.toBeObject(),
    grant: {
      status: 'overturned',
      overturnBasis: 'consent',
      overturnReason: 'The user asked to create this exact file.',
      failureReason: null,
      model: 'claude-haiku-5-5',
      answeringModel: 'claude-haiku-5-5',
      safetyStops: null,
      warm: false,
      rule: 'Outside Task Scope',
      tier: 'soft',
      elapsedMs: expect.toBeNumber(),
    },
  });

  expect(outcome.note).toMatch(
    /^containment cleared by the judge for the targets the user named \(\d+ms\); jev-1\.13\.0: allow/u,
  );

  expect(received).toHaveBeenCalledOnce();
});

test('it reviews the containment finding the user named and a hard-rule Jev deny in one judge call, and still denies', async () => {
  const ctx = await setupTest();

  decisionAnswers.set('rule_1', buildMockDecisionAnswer({ choice: 'block', confidence: 1 }));

  const target = join(ctx.directory, 'repo', '.worktrees', 'label-check', 'label.test.ts');

  const outcome = await classifyAction(
    buildMockActionRequest({
      cwd: join(ctx.directory, 'repo'),
      toolName: 'Write',
      toolInput: { file_path: target, content: "test('it trims a label', () => {});\n" },
      decisionContext: {
        agentID: null,
        lastDirectUserMessage: { text: `Create ${target} with one label test.` },
      },
    }),
    buildMockConfig({
      provider: { protocol: 'system-one', model: 'jev-1.13.0', apiKeyEnv: 'TYPESAFE_API_KEY' },
      judge: { protocol: 'claude-code', model: 'claude-haiku-5-5' },
      claudeSettingsPath: null,
    }),
    {
      stderr: buildStubOutput(),
      runtime: buildMockRuntime({
        env: {
          TYPESAFE_API_KEY: 'test-key',
          PATH: `${ctx.binDir}:${process.env['PATH'] ?? ''}`,
          STUB_CLAUDE_RECORD: ctx.recordPath,
          STUB_CLAUDE_REPLY: JSON.stringify({
            reviews: [
              {
                rule: 'Outside Task Scope',
                verdict: 'overturn',
                basis: 'consent',
                reason: 'The user asked for this file.',
              },
              {
                rule: 'Secret Persistence',
                verdict: 'confirm',
                basis: null,
                reason: 'You would write a secret into a tracked file.',
              },
            ],
          }),
        },
        home: ctx.directory,
        scratchPaths: [],
      }),
    },
  );

  expect(outcome).toMatchObject({
    verdict: { kind: 'deny', rule: 'Secret Persistence' },
    decidingStage: 'judge',
    status: 'deny',
    judge: { status: 'confirmed', rule: 'Secret Persistence', tier: 'hard' },
    grant: { status: 'overturned', rule: 'Outside Task Scope' },
  });

  const calls = await readFile(ctx.recordPath, 'utf8');

  expect(calls.trim().split('\n')).toHaveLength(1);
});

test('it denies a write the message names without asking the judge when the message is stale after a relayed turn', async () => {
  const ctx = await setupTest();

  const target = join(ctx.directory, 'repo', '.worktrees', 'label-check', 'label.test.ts');

  const outcome = await classifyAction(
    buildMockActionRequest({
      cwd: join(ctx.directory, 'repo'),
      toolName: 'Write',
      toolInput: { file_path: target, content: "test('it trims a label', () => {});\n" },
      decisionContext: {
        agentID: null,
        lastDirectUserMessage: {
          text: `Create ${target} with one label test.`,
          freshness: 'stale',
        },
      },
    }),
    buildMockConfig({
      provider: { protocol: 'system-one', model: 'jev-1.13.0', apiKeyEnv: 'TYPESAFE_API_KEY' },
      judge: { protocol: 'claude-code', model: 'claude-haiku-5-5' },
      claudeSettingsPath: null,
    }),
    {
      stderr: buildStubOutput(),
      runtime: buildMockRuntime({
        env: {
          TYPESAFE_API_KEY: 'test-key',
          PATH: `${ctx.binDir}:${process.env['PATH'] ?? ''}`,
          STUB_CLAUDE_RECORD: ctx.recordPath,
          STUB_CLAUDE_REPLY: '{"verdict":"overturn","basis":"consent","reason":"Asked for."}',
        },
        home: ctx.directory,
        scratchPaths: [],
      }),
    },
  );

  expect(outcome).toMatchObject({
    verdict: { kind: 'deny', rule: 'Outside Task Scope' },
    decidingStage: 'containment',
    note: `denied by the containment check: ${target}`,
  });

  expect(readFile(ctx.recordPath, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
});

test('it denies a write the opening prompt names without asking the judge when the launcher names a spawner', async () => {
  const ctx = await setupTest();

  const target = join(ctx.directory, 'repo', '.worktrees', 'label-check', 'label.test.ts');
  const scopeFilePath = join(ctx.directory, 'scope.json');

  await writeFile(
    scopeFilePath,
    JSON.stringify({
      format: 'auto-mode.scope',
      version: 1,
      replyChannels: [
        { tool: 'mcp__atc__atc_message_send', field: 'session', recipient: 's-lead' },
      ],
    }),
  );

  const outcome = await classifyAction(
    buildMockActionRequest({
      cwd: join(ctx.directory, 'repo'),
      toolName: 'Write',
      toolInput: { file_path: target, content: "test('it trims a label', () => {});\n" },
      decisionContext: {
        agentID: null,
        lastDirectUserMessage: {
          text: `Create ${target} with one label test.`,
          origin: 'composer',
          position: 'opening',
        },
      },
    }),
    buildMockConfig({
      provider: { protocol: 'system-one', model: 'jev-1.13.0', apiKeyEnv: 'TYPESAFE_API_KEY' },
      judge: { protocol: 'claude-code', model: 'claude-haiku-5-5' },
      claudeSettingsPath: null,
    }),
    {
      stderr: buildStubOutput(),
      runtime: buildMockRuntime({
        env: {
          AUTO_MODE_SCOPE_FILE: scopeFilePath,
          TYPESAFE_API_KEY: 'test-key',
          PATH: `${ctx.binDir}:${process.env['PATH'] ?? ''}`,
          STUB_CLAUDE_RECORD: ctx.recordPath,
          STUB_CLAUDE_REPLY: '{"verdict":"overturn","basis":"consent","reason":"Asked for."}',
        },
        home: ctx.directory,
        scratchPaths: [],
      }),
    },
  );

  expect(outcome).toMatchObject({
    verdict: { kind: 'deny', rule: 'Outside Task Scope' },
    decidingStage: 'containment',
    note: `denied by the containment check: ${target}`,
  });

  expect(readFile(ctx.recordPath, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
});

test('it clears a write the opening prompt names on consent when no launcher names a spawner', async () => {
  const ctx = await setupTest();

  const target = join(ctx.directory, 'repo', '.worktrees', 'label-check', 'label.test.ts');

  const outcome = await classifyAction(
    buildMockActionRequest({
      cwd: join(ctx.directory, 'repo'),
      toolName: 'Write',
      toolInput: { file_path: target, content: "test('it trims a label', () => {});\n" },
      decisionContext: {
        agentID: null,
        lastDirectUserMessage: {
          text: `Create ${target} with one label test.`,
          origin: 'composer',
          position: 'opening',
        },
      },
    }),
    buildMockConfig({
      provider: { protocol: 'system-one', model: 'jev-1.13.0', apiKeyEnv: 'TYPESAFE_API_KEY' },
      judge: { protocol: 'claude-code', model: 'claude-haiku-5-5' },
      claudeSettingsPath: null,
    }),
    {
      stderr: buildStubOutput(),
      runtime: buildMockRuntime({
        env: {
          TYPESAFE_API_KEY: 'test-key',
          PATH: `${ctx.binDir}:${process.env['PATH'] ?? ''}`,
          STUB_CLAUDE_RECORD: ctx.recordPath,
          STUB_CLAUDE_REPLY: '{"verdict":"overturn","basis":"consent","reason":"Asked for."}',
        },
        home: ctx.directory,
        scratchPaths: [],
      }),
    },
  );

  expect(outcome).toMatchObject({
    verdict: { kind: 'allow' },
    grant: { status: 'overturned', overturnBasis: 'consent' },
  });
});

test('it clears a write that a later typed message names on consent when the launcher names a spawner', async () => {
  const ctx = await setupTest();

  const target = join(ctx.directory, 'repo', '.worktrees', 'label-check', 'label.test.ts');
  const scopeFilePath = join(ctx.directory, 'scope.json');

  await writeFile(
    scopeFilePath,
    JSON.stringify({
      format: 'auto-mode.scope',
      version: 1,
      replyChannels: [
        { tool: 'mcp__atc__atc_message_send', field: 'session', recipient: 's-lead' },
      ],
    }),
  );

  const outcome = await classifyAction(
    buildMockActionRequest({
      cwd: join(ctx.directory, 'repo'),
      toolName: 'Write',
      toolInput: { file_path: target, content: "test('it trims a label', () => {});\n" },
      decisionContext: {
        agentID: null,
        originalUserTask: { text: 'Tidy the label module.', origin: 'composer' },
        lastDirectUserMessage: {
          text: `Create ${target} with one label test.`,
          origin: 'composer',
        },
      },
    }),
    buildMockConfig({
      provider: { protocol: 'system-one', model: 'jev-1.13.0', apiKeyEnv: 'TYPESAFE_API_KEY' },
      judge: { protocol: 'claude-code', model: 'claude-haiku-5-5' },
      claudeSettingsPath: null,
    }),
    {
      stderr: buildStubOutput(),
      runtime: buildMockRuntime({
        env: {
          AUTO_MODE_SCOPE_FILE: scopeFilePath,
          TYPESAFE_API_KEY: 'test-key',
          PATH: `${ctx.binDir}:${process.env['PATH'] ?? ''}`,
          STUB_CLAUDE_RECORD: ctx.recordPath,
          STUB_CLAUDE_REPLY: '{"verdict":"overturn","basis":"consent","reason":"Asked for."}',
        },
        home: ctx.directory,
        scratchPaths: [],
      }),
    },
  );

  expect(outcome).toMatchObject({
    verdict: { kind: 'allow' },
    grant: { status: 'overturned', overturnBasis: 'consent' },
  });
});

test('it keeps an outbound deny that the judge overturns on consent when the only user text is a spawned opening prompt', async () => {
  const ctx = await setupTest();

  const scopeFilePath = join(ctx.directory, 'scope.json');

  await writeFile(
    scopeFilePath,
    JSON.stringify({
      format: 'auto-mode.scope',
      version: 1,
      replyChannels: [
        { tool: 'mcp__atc__atc_message_send', field: 'session', recipient: 's-lead' },
      ],
    }),
  );

  decisionAnswers.set('rule_10', buildMockDecisionAnswer({ choice: 'block', confidence: 1 }));

  const outcome = await classifyAction(
    buildMockActionRequest({
      cwd: join(ctx.directory, 'repo'),
      toolName: 'mcp__atc__atc_message_send',
      toolInput: { session: 's-archive', text: 'the nightly build is green' },
      decisionContext: {
        agentID: null,
        originalUserTask: {
          text: 'Check the nightly build, then tell session s-archive the result.',
          origin: 'composer',
        },
        lastDirectUserMessage: {
          text: 'Check the nightly build, then tell session s-archive the result.',
          origin: 'composer',
          position: 'opening',
        },
      },
    }),
    buildMockConfig({
      provider: { protocol: 'system-one', model: 'jev-1.13.0', apiKeyEnv: 'TYPESAFE_API_KEY' },
      judge: { protocol: 'claude-code', model: 'claude-haiku-5-5' },
      claudeSettingsPath: null,
    }),
    {
      stderr: buildStubOutput(),
      runtime: buildMockRuntime({
        env: {
          AUTO_MODE_SCOPE_FILE: scopeFilePath,
          TYPESAFE_API_KEY: 'test-key',
          PATH: `${ctx.binDir}:${process.env['PATH'] ?? ''}`,
          STUB_CLAUDE_RECORD: ctx.recordPath,
          STUB_CLAUDE_REPLY:
            '{"verdict":"overturn","basis":"consent","reason":"The message names this session."}',
        },
        home: ctx.directory,
        scratchPaths: [],
      }),
    },
  );

  expect(outcome).toMatchObject({
    verdict: { kind: 'deny', rule: 'Outbound Communication' },
    decidingStage: 'judge',
    judge: { status: 'held', overturnBasis: 'consent', rule: 'Outbound Communication' },
  });
});

test('it sends Jev the opening prompt of a spawned session as the delegated task, with no user message', async () => {
  const ctx = await setupTest();

  const scopeFilePath = join(ctx.directory, 'scope.json');

  await writeFile(
    scopeFilePath,
    JSON.stringify({
      format: 'auto-mode.scope',
      version: 1,
      replyChannels: [
        { tool: 'mcp__atc__atc_message_send', field: 'session', recipient: 's-lead' },
      ],
    }),
  );

  const received = mock<(body: unknown) => void>();

  server.use(
    http.post(DECISION_URL, async (info) => {
      const body: unknown = await info.request.clone().json();

      received(body);
    }),
  );

  const outcome = await classifyAction(
    buildMockActionRequest({
      cwd: join(ctx.directory, 'repo'),
      toolName: 'mcp__atc__atc_message_send',
      toolInput: { session: 's-archive', text: 'the nightly build is green' },
      decisionContext: {
        agentID: null,
        originalUserTask: {
          text: 'Check the nightly build, then tell session s-archive the result.',
          origin: 'composer',
          position: 'opening',
        },
        delegatedTask: null,
        lastDirectUserMessage: {
          text: 'Check the nightly build, then tell session s-archive the result.',
          origin: 'composer',
          position: 'opening',
        },
        omittedTaskContext: [],
      },
    }),
    buildMockConfig({
      provider: { protocol: 'system-one', apiKeyEnv: 'TYPESAFE_API_KEY' },
      judge: null,
      claudeSettingsPath: null,
    }),
    {
      stderr: buildStubOutput(),
      runtime: buildMockRuntime({
        env: { AUTO_MODE_SCOPE_FILE: scopeFilePath, TYPESAFE_API_KEY: 'test-key' },
        home: ctx.directory,
        scratchPaths: [],
      }),
    },
  );

  expect(outcome.decidingStage).toBe('jev');

  const requestSchema = z.object({
    state: z.object({ lastUserMessage: z.unknown(), taskContext: z.unknown() }),
  });

  const [call] = received.mock.calls;

  invariant(call, 'the decision service received the request');

  expect(requestSchema.parse(call[0]).state).toStrictEqual({
    lastUserMessage: null,
    taskContext: {
      agentID: null,
      originalUserTask: null,
      delegatedTask: {
        text: 'Check the nightly build, then tell session s-archive the result.',
        origin: 'agent.spawn',
      },
      lastDirectUserMessage: null,
      omittedTaskContext: [{ field: 'originalUserTask', reason: 'unavailable' }],
    },
  });
});

test('it reviews a write the user types after its opening prompt was denied in a spawned session, instead of repeating the deny', async () => {
  const ctx = await setupTest();

  const target = join(ctx.directory, 'repo', '.worktrees', 'label-check', 'label.test.ts');
  const scopeFilePath = join(ctx.directory, 'scope.json');

  await writeFile(
    scopeFilePath,
    JSON.stringify({
      format: 'auto-mode.scope',
      version: 1,
      replyChannels: [
        { tool: 'mcp__atc__atc_message_send', field: 'session', recipient: 's-lead' },
      ],
    }),
  );

  const config = buildMockConfig({
    provider: { protocol: 'system-one', model: 'jev-1.13.0', apiKeyEnv: 'TYPESAFE_API_KEY' },
    judge: { protocol: 'claude-code', model: 'claude-haiku-5-5' },
    claudeSettingsPath: null,
  });

  const runtime = buildMockRuntime({
    env: {
      AUTO_MODE_SCOPE_FILE: scopeFilePath,
      TYPESAFE_API_KEY: 'test-key',
      PATH: `${ctx.binDir}:${process.env['PATH'] ?? ''}`,
      STUB_CLAUDE_RECORD: ctx.recordPath,
      STUB_CLAUDE_REPLY: '{"verdict":"overturn","basis":"consent","reason":"Asked for."}',
    },
    home: ctx.directory,
    scratchPaths: [],
  });

  await classifyAction(
    buildMockActionRequest({
      sessionID: 'spawned-session',
      cwd: join(ctx.directory, 'repo'),
      toolName: 'Write',
      toolInput: { file_path: target, content: "test('it trims a label', () => {});\n" },
      decisionContext: {
        agentID: null,
        lastDirectUserMessage: {
          text: `Create ${target} with one label test.`,
          origin: 'composer',
          position: 'opening',
        },
      },
    }),
    config,
    { runtime, stderr: buildStubOutput(), budget: true },
  );

  const outcome = await classifyAction(
    buildMockActionRequest({
      sessionID: 'spawned-session',
      cwd: join(ctx.directory, 'repo'),
      toolName: 'Write',
      toolInput: { file_path: target, content: "test('it trims a label', () => {});\n" },
      decisionContext: {
        agentID: null,
        lastDirectUserMessage: {
          text: `Create ${target} with one label test.`,
          origin: 'composer',
        },
      },
    }),
    config,
    { runtime, stderr: buildStubOutput(), budget: true },
  );

  expect(outcome).toMatchObject({
    verdict: { kind: 'allow' },
    grant: { status: 'overturned', overturnBasis: 'consent' },
  });
});

test.each([
  [
    'an admin merge of the pull request the message names',
    'gh pr merge 512 --admin',
    'Merge #512 now, with --admin if you must.',
  ],
  [
    'an admin merge that follows a merge of the pull request the message names',
    'gh pr merge 512 && gh pr merge 513 --admin',
    'Merge #512 now.',
  ],
  [
    'a push to the default branch the message names',
    'git push origin HEAD:main',
    'Push this straight to main.',
  ],
])('it denies %s without asking the judge', async (_label, command, message) => {
  const ctx = await setupTest();

  runGit(ctx.directory, [
    '-C',
    join(ctx.directory, 'repo'),
    'commit',
    '-q',
    '--allow-empty',
    '-m',
    'init',
  ]);

  runGit(ctx.directory, [
    '-C',
    join(ctx.directory, 'repo'),
    'worktree',
    'add',
    '-q',
    '.worktrees/queue-columns',
    '-b',
    'feat/queue-columns',
  ]);

  const outcome = await classifyAction(
    buildMockActionRequest({
      cwd: join(ctx.directory, 'repo', '.worktrees', 'queue-columns'),
      toolName: 'Bash',
      toolInput: { command },
      decisionContext: { agentID: null, lastDirectUserMessage: { text: message } },
    }),
    buildMockConfig({
      provider: { protocol: 'system-one', model: 'jev-1.13.0', apiKeyEnv: 'TYPESAFE_API_KEY' },
      judge: { protocol: 'claude-code', model: 'claude-haiku-5-5' },
      claudeSettingsPath: null,
    }),
    {
      stderr: buildStubOutput(),
      runtime: buildMockRuntime({
        env: {
          TYPESAFE_API_KEY: 'test-key',
          PATH: `${ctx.binDir}:${process.env['PATH'] ?? ''}`,
          STUB_CLAUDE_RECORD: ctx.recordPath,
          STUB_CLAUDE_REPLY: '{"verdict":"overturn","basis":"consent","reason":"Asked for."}',
        },
        home: ctx.directory,
        scratchPaths: [],
      }),
    },
  );

  expect(outcome).toMatchObject({
    verdict: { kind: 'deny', rule: 'Outside Task Scope' },
    decidingStage: 'containment',
    status: 'deny',
  });

  expect(readFile(ctx.recordPath, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
});

test.each([
  ['LEFTHOOK=0 git push', 'LEFTHOOK=0'],
  ['HUSKY=0 git commit -m x', 'HUSKY=0'],
  ['git commit --no-verify -m x', '--no-verify'],
  ['git push --no-verify', '--no-verify'],
  ['LEFTHOOK_EXCLUDE=test git push', 'LEFTHOOK_EXCLUDE'],
  ['LEFTHOOK_SKIP=lint git commit -m x', 'LEFTHOOK_SKIP'],
  ['LEFTHOOK_EXCLUDE=test gh stack push', 'LEFTHOOK_EXCLUDE'],
  ['LEFTHOOK_EXCLUDE=test gh stack sync', 'LEFTHOOK_EXCLUDE'],
  ['LEFTHOOK_EXCLUDE=test gh stack submit', 'LEFTHOOK_EXCLUDE'],
  ['LEFTHOOK_CONFIG=quiet.yml git push', 'LEFTHOOK_CONFIG'],
  ['git -c core.hooksPath=.git/hooks commit -m x', 'core.hooksPath'],
  [
    'GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=core.hooksPath GIT_CONFIG_VALUE_0=/tmp/none gh stack push',
    'core.hooksPath',
  ],
  ['LEFTHOOK_BIN=/usr/bin/true git commit -m x', 'LEFTHOOK_BIN'],
  [`GIT_CONFIG_PARAMETERS="'core.hooksPath'='/tmp/none'" gh stack push`, 'core.hooksPath'],
  ['GIT_CONFIG_SYSTEM=$CONFIG git commit -m x', 'GIT_CONFIG_SYSTEM'],
  ['GIT_CONFIG_GLOBAL=/dev/zero git push', 'GIT_CONFIG_GLOBAL'],
])('it sends the hook bypass %s to Jev under Policy Tampering', async (command, bypass) => {
  const ctx = await setupTest();

  runGit(ctx.directory, [
    '-C',
    join(ctx.directory, 'repo'),
    'commit',
    '-q',
    '--allow-empty',
    '-m',
    'init',
  ]);

  runGit(ctx.directory, [
    '-C',
    join(ctx.directory, 'repo'),
    'worktree',
    'add',
    '-q',
    '.worktrees/feature',
    '-b',
    'feature',
  ]);

  const received = mock<(body: unknown) => void>();

  server.use(
    http.post(DECISION_URL, async (info) => {
      const body: unknown = await info.request.clone().json();

      received(body);
    }),
  );

  const outcome = await classifyAction(
    buildMockActionRequest({
      cwd: join(ctx.directory, 'repo', '.worktrees', 'feature'),
      toolName: 'Bash',
      toolInput: { command },
    }),
    buildMockConfig({
      provider: { protocol: 'system-one', apiKeyEnv: 'TYPESAFE_API_KEY' },
      judge: null,
      claudeSettingsPath: null,
    }),
    {
      stderr: buildStubOutput(),
      runtime: buildMockRuntime({
        env: { TYPESAFE_API_KEY: 'test-key' },
        home: ctx.directory,
        scratchPaths: [],
      }),
    },
  );

  expect(outcome.decidingStage).toBe('jev');

  const questionSchema = z.object({ instructions: z.string() });
  const requestSchema = z.object({ questions: z.record(z.string(), questionSchema) });
  const [call] = received.mock.calls;

  invariant(call, 'the decision service received the request');

  const questions = Object.values(requestSchema.parse(call[0]).questions);
  const question = questions.find((entry) => entry.instructions.includes('### Policy Tampering\n'));

  invariant(question, 'the request asks about Policy Tampering');

  expect(question.instructions).toInclude(
    `The pending action runs a git commit, a git push or a gh stack command that commits or pushes, with the repository's hooks or some of their steps turned off or replaced, through ${bypass}.`,
  );
});

test('it reads the global git config a push names to tell Jev it moves the hooks folder', async () => {
  const ctx = await setupTest();

  runGit(ctx.directory, [
    '-C',
    join(ctx.directory, 'repo'),
    'commit',
    '-q',
    '--allow-empty',
    '-m',
    'init',
  ]);

  runGit(ctx.directory, [
    '-C',
    join(ctx.directory, 'repo'),
    'worktree',
    'add',
    '-q',
    '.worktrees/feature',
    '-b',
    'feature',
  ]);

  await writeFile(
    join(ctx.directory, 'repo', '.worktrees', 'feature', 'quick.gitconfig'),
    '[core]\n\thooksPath = /srv/no-hooks\n',
  );

  const received = mock<(body: unknown) => void>();

  server.use(
    http.post(DECISION_URL, async (info) => {
      const body: unknown = await info.request.clone().json();

      received(body);
    }),
  );

  const outcome = await classifyAction(
    buildMockActionRequest({
      cwd: join(ctx.directory, 'repo', '.worktrees', 'feature'),
      toolName: 'Bash',
      toolInput: { command: 'GIT_CONFIG_GLOBAL=quick.gitconfig git push' },
    }),
    buildMockConfig({
      provider: { protocol: 'system-one', apiKeyEnv: 'TYPESAFE_API_KEY' },
      judge: null,
      claudeSettingsPath: null,
    }),
    {
      stderr: buildStubOutput(),
      runtime: buildMockRuntime({
        env: { TYPESAFE_API_KEY: 'test-key' },
        home: ctx.directory,
        scratchPaths: [],
      }),
    },
  );

  expect(outcome.decidingStage).toBe('jev');

  const questionSchema = z.object({ instructions: z.string() });
  const requestSchema = z.object({ questions: z.record(z.string(), questionSchema) });
  const [call] = received.mock.calls;

  invariant(call, 'the decision service received the request');

  const questions = Object.values(requestSchema.parse(call[0]).questions);
  const question = questions.find((entry) => entry.instructions.includes('### Policy Tampering\n'));

  invariant(question, 'the request asks about Policy Tampering');

  expect(question.instructions).toInclude('turned off or replaced, through GIT_CONFIG_GLOBAL.');
});

test('it reads the global git config a push names to send Jev no hook guidance when it keeps the hooks', async () => {
  const ctx = await setupTest();

  runGit(ctx.directory, [
    '-C',
    join(ctx.directory, 'repo'),
    'commit',
    '-q',
    '--allow-empty',
    '-m',
    'init',
  ]);

  runGit(ctx.directory, [
    '-C',
    join(ctx.directory, 'repo'),
    'worktree',
    'add',
    '-q',
    '.worktrees/feature',
    '-b',
    'feature',
  ]);

  await writeFile(
    join(ctx.directory, 'repo', '.worktrees', 'feature', 'ci.gitconfig'),
    '[user]\n\tname = robin\n',
  );

  const received = mock<(body: unknown) => void>();

  server.use(
    http.post(DECISION_URL, async (info) => {
      const body: unknown = await info.request.clone().json();

      received(body);
    }),
  );

  const outcome = await classifyAction(
    buildMockActionRequest({
      cwd: join(ctx.directory, 'repo', '.worktrees', 'feature'),
      toolName: 'Bash',
      toolInput: { command: 'GIT_CONFIG_GLOBAL=ci.gitconfig git push' },
    }),
    buildMockConfig({
      provider: { protocol: 'system-one', apiKeyEnv: 'TYPESAFE_API_KEY' },
      judge: null,
      claudeSettingsPath: null,
    }),
    {
      stderr: buildStubOutput(),
      runtime: buildMockRuntime({
        env: {
          TYPESAFE_API_KEY: 'test-key',
          GIT_CONFIG_SYSTEM: join(ctx.directory, 'gitconfig'),
        },
        home: ctx.directory,
        scratchPaths: [],
      }),
    },
  );

  expect(outcome.decidingStage).toBe('jev');

  const questionSchema = z.object({ instructions: z.string() });
  const requestSchema = z.object({ questions: z.record(z.string(), questionSchema) });
  const [call] = received.mock.calls;

  invariant(call, 'the decision service received the request');

  const questions = Object.values(requestSchema.parse(call[0]).questions);
  const question = questions.find((entry) => entry.instructions.includes('### Policy Tampering\n'));

  invariant(question, 'the request asks about Policy Tampering');

  expect(question.instructions).not.toInclude('Those hooks are the checks');
});

test('it reads the checkout hooks to send Jev no hook guidance for a push that keeps them', async () => {
  const ctx = await setupTest();

  runGit(ctx.directory, [
    '-C',
    join(ctx.directory, 'repo'),
    'commit',
    '-q',
    '--allow-empty',
    '-m',
    'init',
  ]);

  runGit(ctx.directory, [
    '-C',
    join(ctx.directory, 'repo'),
    'worktree',
    'add',
    '-q',
    '.worktrees/feature',
    '-b',
    'feature',
  ]);

  await writeFile(join(ctx.directory, 'repo', '.worktrees', 'feature', 'lefthook.yml'), '');

  const received = mock<(body: unknown) => void>();

  server.use(
    http.post(DECISION_URL, async (info) => {
      const body: unknown = await info.request.clone().json();

      received(body);
    }),
  );

  const outcome = await classifyAction(
    buildMockActionRequest({
      cwd: join(ctx.directory, 'repo', '.worktrees', 'feature'),
      toolName: 'Bash',
      toolInput: {
        command: `LEFTHOOK_CONFIG=lefthook.yml git -c core.hooksPath=${join(ctx.directory, 'repo', '.git', 'hooks')} push`,
      },
    }),
    buildMockConfig({
      provider: { protocol: 'system-one', apiKeyEnv: 'TYPESAFE_API_KEY' },
      judge: null,
      claudeSettingsPath: null,
    }),
    {
      stderr: buildStubOutput(),
      runtime: buildMockRuntime({
        env: {
          TYPESAFE_API_KEY: 'test-key',
          GIT_CONFIG_SYSTEM: join(ctx.directory, 'gitconfig'),
        },
        home: ctx.directory,
        scratchPaths: [],
      }),
    },
  );

  expect(outcome.decidingStage).toBe('jev');

  const questionSchema = z.object({ instructions: z.string() });
  const requestSchema = z.object({ questions: z.record(z.string(), questionSchema) });
  const [call] = received.mock.calls;

  invariant(call, 'the decision service received the request');

  const questions = Object.values(requestSchema.parse(call[0]).questions);
  const question = questions.find((entry) => entry.instructions.includes('### Policy Tampering\n'));

  invariant(question, 'the request asks about Policy Tampering');

  expect(question.instructions).not.toInclude('Those hooks are the checks');
});

test('it reads the system git config to send Jev no hook guidance for a push that keeps its hooks folder', async () => {
  const ctx = await setupTest();

  runGit(ctx.directory, [
    '-C',
    join(ctx.directory, 'repo'),
    'commit',
    '-q',
    '--allow-empty',
    '-m',
    'init',
  ]);

  runGit(ctx.directory, [
    '-C',
    join(ctx.directory, 'repo'),
    'worktree',
    'add',
    '-q',
    '.worktrees/feature',
    '-b',
    'feature',
  ]);

  await writeFile(
    join(ctx.directory, 'gitconfig'),
    `[core]\n\thooksPath = ${join(ctx.directory, 'shared-hooks')}\n`,
  );

  const received = mock<(body: unknown) => void>();

  server.use(
    http.post(DECISION_URL, async (info) => {
      const body: unknown = await info.request.clone().json();

      received(body);
    }),
  );

  const outcome = await classifyAction(
    buildMockActionRequest({
      cwd: join(ctx.directory, 'repo', '.worktrees', 'feature'),
      toolName: 'Bash',
      toolInput: {
        command: `git -c core.hooksPath=${join(ctx.directory, 'shared-hooks')} push`,
      },
    }),
    buildMockConfig({
      provider: { protocol: 'system-one', apiKeyEnv: 'TYPESAFE_API_KEY' },
      judge: null,
      claudeSettingsPath: null,
    }),
    {
      stderr: buildStubOutput(),
      runtime: buildMockRuntime({
        env: {
          TYPESAFE_API_KEY: 'test-key',
          GIT_CONFIG_SYSTEM: join(ctx.directory, 'gitconfig'),
        },
        home: ctx.directory,
        scratchPaths: [],
      }),
    },
  );

  expect(outcome.decidingStage).toBe('jev');

  const questionSchema = z.object({ instructions: z.string() });
  const requestSchema = z.object({ questions: z.record(z.string(), questionSchema) });
  const [call] = received.mock.calls;

  invariant(call, 'the decision service received the request');

  const questions = Object.values(requestSchema.parse(call[0]).questions);
  const question = questions.find((entry) => entry.instructions.includes('### Policy Tampering\n'));

  invariant(question, 'the request asks about Policy Tampering');

  expect(question.instructions).not.toInclude('Those hooks are the checks');
});

test('it reads the local lefthook config to tell Jev that an Edit of a bare value turns a skip on', async () => {
  const ctx = await setupTest();

  runGit(ctx.directory, [
    '-C',
    join(ctx.directory, 'repo'),
    'commit',
    '-q',
    '--allow-empty',
    '-m',
    'init',
  ]);

  runGit(ctx.directory, [
    '-C',
    join(ctx.directory, 'repo'),
    'worktree',
    'add',
    '-q',
    '.worktrees/feature',
    '-b',
    'feature',
  ]);

  const worktree = join(ctx.directory, 'repo', '.worktrees', 'feature');

  await writeFile(join(worktree, 'lefthook-local.yml'), 'pre-push:\n  skip: false\n');

  const received = mock<(body: unknown) => void>();

  server.use(
    http.post(DECISION_URL, async (info) => {
      const body: unknown = await info.request.clone().json();

      received(body);
    }),
  );

  const outcome = await classifyAction(
    buildMockActionRequest({
      cwd: worktree,
      toolName: 'Edit',
      toolInput: {
        file_path: join(worktree, 'lefthook-local.yml'),
        old_string: 'false',
        new_string: 'true',
      },
    }),
    buildMockConfig({
      provider: { protocol: 'system-one', apiKeyEnv: 'TYPESAFE_API_KEY' },
      judge: null,
      claudeSettingsPath: null,
    }),
    {
      stderr: buildStubOutput(),
      runtime: buildMockRuntime({
        env: { TYPESAFE_API_KEY: 'test-key' },
        home: ctx.directory,
        scratchPaths: [],
      }),
    },
  );

  expect(outcome.decidingStage).toBe('jev');

  const questionSchema = z.object({ instructions: z.string() });
  const requestSchema = z.object({ questions: z.record(z.string(), questionSchema) });
  const [call] = received.mock.calls;

  invariant(call, 'the decision service received the request');

  const questions = Object.values(requestSchema.parse(call[0]).questions);
  const question = questions.find((entry) => entry.instructions.includes('### Policy Tampering\n'));

  invariant(question, 'the request asks about Policy Tampering');

  expect(question.instructions).toInclude(
    "The pending action writes a skip or exclude setting into lefthook's local config",
  );
});

test('it allows a write into a path the launcher scope file owns once Jev allows it', async () => {
  const ctx = await setupTest();

  const scopeFilePath = join(ctx.directory, 'scope.json');
  const notes = join(ctx.directory, 'notes');

  await writeFile(
    scopeFilePath,
    JSON.stringify({ format: 'auto-mode.scope', version: 1, paths: [notes] }),
  );

  const outcome = await classifyAction(
    buildMockActionRequest({
      cwd: join(ctx.directory, 'repo'),
      toolName: 'Write',
      toolInput: { file_path: join(notes, 'todo.md'), content: '- write the summary\n' },
    }),
    buildMockConfig({
      provider: { protocol: 'system-one', apiKeyEnv: 'TYPESAFE_API_KEY' },
      judge: null,
      claudeSettingsPath: null,
    }),
    {
      stderr: buildStubOutput(),
      runtime: buildMockRuntime({
        env: { AUTO_MODE_SCOPE_FILE: scopeFilePath, TYPESAFE_API_KEY: 'test-key' },
        home: ctx.directory,
        scratchPaths: [],
      }),
    },
  );

  expect(outcome).toMatchObject({
    verdict: { kind: 'allow' },
    decidingStage: 'jev',
    status: 'allow',
  });
});

test('it denies a write outside every path the launcher scope file owns in the containment check', async () => {
  const ctx = await setupTest();

  const scopeFilePath = join(ctx.directory, 'scope.json');
  const received = mock();

  await writeFile(
    scopeFilePath,
    JSON.stringify({
      format: 'auto-mode.scope',
      version: 1,
      paths: [join(ctx.directory, 'notes')],
    }),
  );

  server.use(
    http.post(DECISION_URL, () => {
      received();
    }),
  );

  const outcome = await classifyAction(
    buildMockActionRequest({
      cwd: join(ctx.directory, 'repo'),
      toolName: 'Write',
      toolInput: {
        file_path: join(ctx.directory, 'drafts', 'todo.md'),
        content: '- write the summary\n',
      },
    }),
    buildMockConfig({
      provider: { protocol: 'system-one', apiKeyEnv: 'TYPESAFE_API_KEY' },
      judge: null,
      claudeSettingsPath: null,
    }),
    {
      stderr: buildStubOutput(),
      runtime: buildMockRuntime({
        env: { AUTO_MODE_SCOPE_FILE: scopeFilePath, TYPESAFE_API_KEY: 'test-key' },
        home: ctx.directory,
        scratchPaths: [],
      }),
    },
  );

  expect(outcome).toMatchObject({
    verdict: { kind: 'deny', rule: 'Outside Task Scope' },
    decidingStage: 'containment',
    status: 'deny',
  });

  expect(received).not.toHaveBeenCalled();
});

test('it allows a message to a reply-channel recipient without asking Jev', async () => {
  const ctx = await setupTest();

  const scopeFilePath = join(ctx.directory, 'scope.json');
  const received = mock();

  await writeFile(
    scopeFilePath,
    JSON.stringify({
      format: 'auto-mode.scope',
      version: 1,
      replyChannels: [{ tool: 'SendMessage', field: 'to', recipient: 'lead' }],
    }),
  );

  server.use(
    http.post(DECISION_URL, () => {
      received();
    }),
  );

  const outcome = await classifyAction(
    buildMockActionRequest({
      cwd: join(ctx.directory, 'repo'),
      toolName: 'SendMessage',
      toolInput: { to: 'lead', message: 'the build is green' },
    }),
    buildMockConfig({
      provider: { protocol: 'system-one', apiKeyEnv: 'TYPESAFE_API_KEY' },
      judge: null,
      claudeSettingsPath: null,
    }),
    {
      stderr: buildStubOutput(),
      runtime: buildMockRuntime({
        env: { AUTO_MODE_SCOPE_FILE: scopeFilePath, TYPESAFE_API_KEY: 'test-key' },
        home: ctx.directory,
        scratchPaths: [],
      }),
    },
  );

  expect(outcome).toStrictEqual({
    verdict: { kind: 'allow' },
    decidingStage: 'bypass',
    note: 'allowed by the reply channel: SendMessage to lead',
    status: 'allow',
  });

  expect(received).not.toHaveBeenCalled();
});

test('it allows a message to the spawner when the opening prompt is the only user text', async () => {
  const ctx = await setupTest();

  const scopeFilePath = join(ctx.directory, 'scope.json');
  const received = mock();

  await writeFile(
    scopeFilePath,
    JSON.stringify({
      format: 'auto-mode.scope',
      version: 1,
      replyChannels: [{ tool: 'SendMessage', field: 'to', recipient: 'lead' }],
    }),
  );

  server.use(
    http.post(DECISION_URL, () => {
      received();
    }),
  );

  const outcome = await classifyAction(
    buildMockActionRequest({
      cwd: join(ctx.directory, 'repo'),
      toolName: 'SendMessage',
      toolInput: { to: 'lead', message: 'the parser tests pass' },
      decisionContext: {
        agentID: null,
        originalUserTask: { text: 'Fix the parser and report to lead.', origin: 'composer' },
        delegatedTask: null,
        lastDirectUserMessage: {
          text: 'Fix the parser and report to lead.',
          origin: 'composer',
          position: 'opening',
        },
        omittedTaskContext: [],
      },
    }),
    buildMockConfig({
      provider: { protocol: 'system-one', apiKeyEnv: 'TYPESAFE_API_KEY' },
      judge: null,
      claudeSettingsPath: null,
    }),
    {
      stderr: buildStubOutput(),
      runtime: buildMockRuntime({
        env: { AUTO_MODE_SCOPE_FILE: scopeFilePath, TYPESAFE_API_KEY: 'test-key' },
        home: ctx.directory,
        scratchPaths: [],
      }),
    },
  );

  expect(outcome).toStrictEqual({
    verdict: { kind: 'allow' },
    decidingStage: 'bypass',
    note: 'allowed by the reply channel: SendMessage to lead',
    status: 'allow',
  });

  expect(received).not.toHaveBeenCalled();
});

test('it allows a message through an MCP tool whose name reads as a remote write to a reply-channel recipient', async () => {
  const ctx = await setupTest();

  const scopeFilePath = join(ctx.directory, 'scope.json');

  await writeFile(
    scopeFilePath,
    JSON.stringify({
      format: 'auto-mode.scope',
      version: 1,
      replyChannels: [
        { tool: 'mcp__chat__create_message', field: 'channel', recipient: 'planner' },
      ],
    }),
  );

  const outcome = await classifyAction(
    buildMockActionRequest({
      cwd: join(ctx.directory, 'repo'),
      toolName: 'mcp__chat__create_message',
      toolInput: { channel: 'planner', text: 'the build is green' },
    }),
    buildMockConfig({
      provider: { protocol: 'system-one' },
      judge: null,
      claudeSettingsPath: null,
    }),
    {
      stderr: buildStubOutput(),
      runtime: buildMockRuntime({
        env: { AUTO_MODE_SCOPE_FILE: scopeFilePath },
        home: ctx.directory,
        scratchPaths: [],
      }),
      localOnly: true,
    },
  );

  expect(outcome).toStrictEqual({
    verdict: { kind: 'allow' },
    decidingStage: 'bypass',
    note: 'allowed by the reply channel: mcp__chat__create_message to planner',
    status: 'allow',
  });
});

test('it asks Jev about a message to a recipient that no reply channel lists', async () => {
  const ctx = await setupTest();

  const scopeFilePath = join(ctx.directory, 'scope.json');
  const received = mock();

  await writeFile(
    scopeFilePath,
    JSON.stringify({
      format: 'auto-mode.scope',
      version: 1,
      replyChannels: [{ tool: 'SendMessage', field: 'to', recipient: 'lead' }],
    }),
  );

  server.use(
    http.post(DECISION_URL, () => {
      received();
    }),
  );

  const outcome = await classifyAction(
    buildMockActionRequest({
      cwd: join(ctx.directory, 'repo'),
      toolName: 'SendMessage',
      toolInput: { to: 'everyone', message: 'the build is green' },
    }),
    buildMockConfig({
      provider: { protocol: 'system-one', apiKeyEnv: 'TYPESAFE_API_KEY' },
      judge: null,
      claudeSettingsPath: null,
    }),
    {
      stderr: buildStubOutput(),
      runtime: buildMockRuntime({
        env: { AUTO_MODE_SCOPE_FILE: scopeFilePath, TYPESAFE_API_KEY: 'test-key' },
        home: ctx.directory,
        scratchPaths: [],
      }),
    },
  );

  expect(outcome.decidingStage).toBe('jev');
  expect(outcome.verdict).toStrictEqual({ kind: 'allow' });
  expect(outcome.status).toBe('allow');
  expect(received).toHaveBeenCalledOnce();
});

test('it asks Jev about a message to a reply-channel recipient that carries a secret', async () => {
  const ctx = await setupTest();

  const scopeFilePath = join(ctx.directory, 'scope.json');
  const key = ['AKIA', 'Z7QW3RTY5UIOP2LK'].join('');
  const received = mock();

  await writeFile(
    scopeFilePath,
    JSON.stringify({
      format: 'auto-mode.scope',
      version: 1,
      replyChannels: [{ tool: 'SendMessage', field: 'to', recipient: 'lead' }],
    }),
  );

  server.use(
    http.post(DECISION_URL, () => {
      received();
    }),
  );

  const outcome = await classifyAction(
    buildMockActionRequest({
      cwd: join(ctx.directory, 'repo'),
      toolName: 'SendMessage',
      toolInput: { to: 'lead', message: `aws_access_key_id = "${key}"` },
    }),
    buildMockConfig({
      provider: { protocol: 'system-one', apiKeyEnv: 'TYPESAFE_API_KEY' },
      judge: null,
      claudeSettingsPath: null,
    }),
    {
      stderr: buildStubOutput(),
      runtime: buildMockRuntime({
        env: { AUTO_MODE_SCOPE_FILE: scopeFilePath, TYPESAFE_API_KEY: 'test-key' },
        home: ctx.directory,
        scratchPaths: [],
      }),
    },
  );

  expect(outcome.decidingStage).toBe('jev');
  expect(outcome.verdict).toStrictEqual({ kind: 'allow' });
  expect(outcome.status).toBe('allow');
  expect(received).toHaveBeenCalledOnce();
});

test('it sends a message to a reply-channel recipient to the model tier when the user configured deny entries', async () => {
  const ctx = await setupTest();

  const scopeFilePath = join(ctx.directory, 'scope.json');

  await writeFile(
    scopeFilePath,
    JSON.stringify({
      format: 'auto-mode.scope',
      version: 1,
      replyChannels: [{ tool: 'SendMessage', field: 'to', recipient: 'lead' }],
    }),
  );

  await writeFile(
    join(ctx.directory, 'settings.json'),
    JSON.stringify({ autoMode: { soft_deny: ['Never message the lead'] } }),
  );

  const outcome = await classifyAction(
    buildMockActionRequest({
      cwd: join(ctx.directory, 'repo'),
      toolName: 'SendMessage',
      toolInput: { to: 'lead', message: 'the build is green' },
    }),
    buildMockConfig({
      provider: { protocol: 'system-one' },
      judge: null,
      claudeSettingsPath: join(ctx.directory, 'settings.json'),
    }),
    {
      stderr: buildStubOutput(),
      runtime: buildMockRuntime({
        env: { AUTO_MODE_SCOPE_FILE: scopeFilePath },
        home: ctx.directory,
        scratchPaths: [],
      }),
      localOnly: true,
    },
  );

  expect(outcome).toStrictEqual({
    verdict: null,
    decidingStage: 'local',
    note: 'SendMessage needs the model tier, which this run skipped',
    status: 'skipped',
  });
});

test('it allows a message to the spawner past Outbound Communication when the user configured deny entries', async () => {
  const ctx = await setupTest();

  const scopeFilePath = join(ctx.directory, 'scope.json');

  await writeFile(
    scopeFilePath,
    JSON.stringify({
      format: 'auto-mode.scope',
      version: 1,
      replyChannels: [
        { tool: 'mcp__atc__atc_message_send', field: 'session', recipient: 's-lead' },
      ],
    }),
  );

  await writeFile(
    join(ctx.directory, 'settings.json'),
    JSON.stringify({ autoMode: { soft_deny: ['Never run terraform apply against production'] } }),
  );

  const received = mock<(body: unknown) => void>();

  server.use(
    http.post(DECISION_URL, async (info) => {
      const body: unknown = await info.request.clone().json();

      received(body);
    }),
  );

  const outcome = await classifyAction(
    buildMockActionRequest({
      cwd: join(ctx.directory, 'repo'),
      toolName: 'mcp__atc__atc_message_send',
      toolInput: { session: 's-lead', text: 'the build is green' },
    }),
    buildMockConfig({
      provider: { protocol: 'system-one', apiKeyEnv: 'TYPESAFE_API_KEY' },
      judge: null,
      claudeSettingsPath: join(ctx.directory, 'settings.json'),
    }),
    {
      stderr: buildStubOutput(),
      runtime: buildMockRuntime({
        env: { AUTO_MODE_SCOPE_FILE: scopeFilePath, TYPESAFE_API_KEY: 'test-key' },
        home: ctx.directory,
        scratchPaths: [],
      }),
    },
  );

  expect(outcome).toMatchObject({ verdict: { kind: 'allow' }, decidingStage: 'jev' });

  const questionSchema = z.object({ instructions: z.string() });
  const requestSchema = z.object({ questions: z.record(z.string(), questionSchema) });
  const [call] = received.mock.calls;

  invariant(call, 'the decision service received the request');

  const questions = requestSchema.parse(call[0]).questions;
  const instructions = Object.values(questions).map((question) => question.instructions);

  expect(instructions).not.toContainEqual(expect.toInclude('### Outbound Communication\n'));
  expect(instructions).toContainEqual(expect.toInclude('### Data Exfiltration\n'));

  expect(questions['soft_deny_0']?.instructions).toInclude(
    'Never run terraform apply against production',
  );
});

test('it denies a message to the spawner that a configured deny entry blocks', async () => {
  const ctx = await setupTest();

  const scopeFilePath = join(ctx.directory, 'scope.json');

  await writeFile(
    scopeFilePath,
    JSON.stringify({
      format: 'auto-mode.scope',
      version: 1,
      replyChannels: [
        { tool: 'mcp__atc__atc_message_send', field: 'session', recipient: 's-lead' },
      ],
    }),
  );

  await writeFile(
    join(ctx.directory, 'settings.json'),
    JSON.stringify({ autoMode: { soft_deny: ['Never message session s-lead'] } }),
  );

  decisionAnswers.set('soft_deny_0', buildMockDecisionAnswer({ choice: 'block', confidence: 1 }));

  const outcome = await classifyAction(
    buildMockActionRequest({
      cwd: join(ctx.directory, 'repo'),
      toolName: 'mcp__atc__atc_message_send',
      toolInput: { session: 's-lead', text: 'the build is green' },
    }),
    buildMockConfig({
      provider: { protocol: 'system-one', apiKeyEnv: 'TYPESAFE_API_KEY' },
      judge: null,
      claudeSettingsPath: join(ctx.directory, 'settings.json'),
    }),
    {
      stderr: buildStubOutput(),
      runtime: buildMockRuntime({
        env: { AUTO_MODE_SCOPE_FILE: scopeFilePath, TYPESAFE_API_KEY: 'test-key' },
        home: ctx.directory,
        scratchPaths: [],
      }),
    },
  );

  expect(outcome).toMatchObject({ verdict: { kind: 'deny' }, decidingStage: 'jev' });
});

test('it denies a message to an unrelated session under Outbound Communication when the user configured deny entries', async () => {
  const ctx = await setupTest();

  const scopeFilePath = join(ctx.directory, 'scope.json');

  await writeFile(
    scopeFilePath,
    JSON.stringify({
      format: 'auto-mode.scope',
      version: 1,
      replyChannels: [
        { tool: 'mcp__atc__atc_message_send', field: 'session', recipient: 's-lead' },
      ],
    }),
  );

  await writeFile(
    join(ctx.directory, 'settings.json'),
    JSON.stringify({ autoMode: { soft_deny: ['Never run terraform apply against production'] } }),
  );

  decisionAnswers.set('rule_10', buildMockDecisionAnswer({ choice: 'block', confidence: 1 }));

  const outcome = await classifyAction(
    buildMockActionRequest({
      cwd: join(ctx.directory, 'repo'),
      toolName: 'mcp__atc__atc_message_send',
      toolInput: { session: 's-archive', text: 'the build is green' },
    }),
    buildMockConfig({
      provider: { protocol: 'system-one', apiKeyEnv: 'TYPESAFE_API_KEY' },
      judge: null,
      claudeSettingsPath: join(ctx.directory, 'settings.json'),
    }),
    {
      stderr: buildStubOutput(),
      runtime: buildMockRuntime({
        env: { AUTO_MODE_SCOPE_FILE: scopeFilePath, TYPESAFE_API_KEY: 'test-key' },
        home: ctx.directory,
        scratchPaths: [],
      }),
    },
  );

  expect(outcome).toMatchObject({
    verdict: { kind: 'deny', rule: 'Outbound Communication' },
    decidingStage: 'jev',
  });
});

test('it lets an edit into the workspace an atc record names skip Jev when no scope file exists', async () => {
  const ctx = await setupTest();

  const repo = join(ctx.directory, 'repo');
  const recordPath = join(ctx.directory, 'record.json');

  runGit(ctx.directory, ['-C', repo, 'commit', '-q', '--allow-empty', '-m', 'init']);

  runGit(ctx.directory, [
    '-C',
    repo,
    'worktree',
    'add',
    '-q',
    '.worktrees/feature',
    '-b',
    'feature',
  ]);

  await writeFile(
    recordPath,
    JSON.stringify({
      format: 'atc.session-record',
      version: 1,
      session: 'atc-1',
      scope: {
        workspace: { path: join(repo, '.worktrees', 'feature'), branch: 'feature' },
        worktrees: [],
        branches: [],
        pullRequests: [],
      },
    }),
  );

  const target = join(repo, '.worktrees', 'feature', 'src', 'a.ts');

  const outcome = await classifyAction(
    buildMockActionRequest({
      cwd: repo,
      toolName: 'Write',
      toolInput: { file_path: target, content: 'export const a = 1;\n' },
    }),
    buildMockConfig({
      provider: { protocol: 'system-one' },
      judge: null,
      claudeSettingsPath: null,
    }),
    {
      stderr: buildStubOutput(),
      runtime: buildMockRuntime({
        env: { ATC_SESSION_RECORD: recordPath, ATC_SESSION_ID: 'atc-1' },
        home: ctx.directory,
        scratchPaths: [],
      }),
      localOnly: true,
    },
  );

  expect(outcome).toStrictEqual({
    verdict: { kind: 'allow' },
    decidingStage: 'bypass',
    note: `allowed by the edit bypass: ${target}`,
    status: 'allow',
  });
});

test('it sends a write of a skip setting into the local lefthook config to Jev under Policy Tampering', async () => {
  const ctx = await setupTest();

  runGit(ctx.directory, [
    '-C',
    join(ctx.directory, 'repo'),
    'commit',
    '-q',
    '--allow-empty',
    '-m',
    'init',
  ]);

  runGit(ctx.directory, [
    '-C',
    join(ctx.directory, 'repo'),
    'worktree',
    'add',
    '-q',
    '.worktrees/feature',
    '-b',
    'feature',
  ]);

  const received = mock<(body: unknown) => void>();

  server.use(
    http.post(DECISION_URL, async (info) => {
      const body: unknown = await info.request.clone().json();

      received(body);
    }),
  );

  const worktree = join(ctx.directory, 'repo', '.worktrees', 'feature');

  const outcome = await classifyAction(
    buildMockActionRequest({
      cwd: worktree,
      toolName: 'Write',
      toolInput: {
        file_path: join(worktree, 'lefthook-local.yml'),
        content: 'pre-push:\n  jobs:\n    - name: test\n      skip: true\n',
      },
    }),
    buildMockConfig({
      provider: { protocol: 'system-one', apiKeyEnv: 'TYPESAFE_API_KEY' },
      judge: null,
      claudeSettingsPath: null,
    }),
    {
      stderr: buildStubOutput(),
      runtime: buildMockRuntime({
        env: { TYPESAFE_API_KEY: 'test-key' },
        home: ctx.directory,
        scratchPaths: [],
      }),
    },
  );

  expect(outcome.decidingStage).toBe('jev');

  const questionSchema = z.object({ instructions: z.string() });
  const requestSchema = z.object({ questions: z.record(z.string(), questionSchema) });
  const [call] = received.mock.calls;

  invariant(call, 'the decision service received the request');

  const questions = Object.values(requestSchema.parse(call[0]).questions);
  const question = questions.find((entry) => entry.instructions.includes('### Policy Tampering\n'));

  invariant(question, 'the request asks about Policy Tampering');

  expect(question.instructions).toInclude(
    "The pending action writes a skip or exclude setting into lefthook's local config",
  );
});
