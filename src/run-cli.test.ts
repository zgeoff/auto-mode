import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HttpResponse, http } from 'msw';
import invariant from 'tiny-invariant';
import { decisionAnswers } from '../mocks/decision-answers.ts';
import { DECISION_URL } from '../mocks/handlers.ts';
import { server } from '../mocks/node.ts';
import type { StubOutput } from '../test-utils/build-stub-output.ts';
import { buildStubOutput } from '../test-utils/build-stub-output.ts';
import { buildMockModRequest } from '../test-utils/factories/build-mock-mod-request.ts';
import { runGit } from '../test-utils/run-git.ts';
import type { HostEnvironment } from './config/types.ts';
import { runCLI } from './run-cli.ts';

async function setupTest(): Promise<{
  readonly dir: string;
  readonly repo: string;
  readonly host: HostEnvironment;
  readonly stdout: StubOutput;
  readonly stderr: StubOutput;
  readonly signal: AbortSignal;
}> {
  const created = await mkdtemp(join(tmpdir(), 'auto-mode-run-cli-'));

  onTestFinished(() => rm(created, { recursive: true, force: true }));

  const dir = await realpath(created);

  const repo = join(dir, 'repo');

  // The checkout search walks up from the cwd and would stop at any .git
  // above the temp root, so the repo is a checkout of its own.
  runGit(dir, ['init', '-q', '-b', 'main', repo]);

  return {
    dir,
    repo,
    host: {
      env: {
        // the scope readers start git, which the CLI finds through PATH
        PATH: process.env['PATH'],

        // config, state, diagnostics and Claude settings all resolve under the temp root
        XDG_CONFIG_HOME: dir,
        XDG_STATE_HOME: dir,
        AUTO_MODE_DIAGNOSTICS_PATH: join(dir, 'actions.jsonl'),
        CLAUDE_CONFIG_DIR: dir,
      },
      home: dir,

      // the temp root sits under /tmp, which the default treats as scratch space
      scratchPaths: [],
    },
    stdout: buildStubOutput(),
    stderr: buildStubOutput(),
    signal: new AbortController().signal,
  };
}

test.each([
  ['no command', []],
  ['--help', ['--help']],
])('it prints usage and exits 0 when given %s', async (_label, argv) => {
  const ctx = await setupTest();

  const exitCode = await runCLI(argv, {
    stdin: () => Promise.resolve(''),
    stdout: ctx.stdout,
    stderr: ctx.stderr,
    host: ctx.host,
    signal: ctx.signal,
  });

  expect({ exitCode, stdout: ctx.stdout.read(), stderr: ctx.stderr.read() }).toStrictEqual({
    exitCode: 0,
    stdout: `auto-mode — a permission classifier for the auto-mode Claude Code mod

Usage:
  auto-mode run              Read an action request on stdin, write a verdict on stdout
  auto-mode print-prompt     Print the system prompt the classifier receives
  auto-mode record           Read a finished Bash call on stdin, add what it created to the session's scope

Options:
  --classifier <path>   Use this framework file instead of the shipped one
  --rules <path>        Use this rule list instead of the shipped one
  --explain             With run: also write the reasoning to stderr
  --local-only          With run: skip the model tier
  --jev-only            With run: require Jev and cap its API timeout at 5 seconds
  --evaluation-deadline <unix-ms>  With --jev-only: share the helper and API deadline
`,
    stderr: '',
  });
});

test('it exits 2 with usage on stderr on a command it does not know', async () => {
  const ctx = await setupTest();

  const exitCode = await runCLI(['frobnicate'], {
    stdin: () => Promise.resolve(''),
    stdout: ctx.stdout,
    stderr: ctx.stderr,
    host: ctx.host,
    signal: ctx.signal,
  });

  expect({ exitCode, stdout: ctx.stdout.read(), stderr: ctx.stderr.read() }).toStrictEqual({
    exitCode: 2,
    stdout: '',
    stderr: `auto-mode: unknown command 'frobnicate'

auto-mode — a permission classifier for the auto-mode Claude Code mod

Usage:
  auto-mode run              Read an action request on stdin, write a verdict on stdout
  auto-mode print-prompt     Print the system prompt the classifier receives
  auto-mode record           Read a finished Bash call on stdin, add what it created to the session's scope

Options:
  --classifier <path>   Use this framework file instead of the shipped one
  --rules <path>        Use this rule list instead of the shipped one
  --explain             With run: also write the reasoning to stderr
  --local-only          With run: skip the model tier
  --jev-only            With run: require Jev and cap its API timeout at 5 seconds
  --evaluation-deadline <unix-ms>  With --jev-only: share the helper and API deadline
`,
  });
});

test('it refuses a traditional evaluator in Jev-only mode before a local allowance', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.dir, 'auto-mode'));

  await writeFile(
    join(ctx.dir, 'auto-mode', 'config.json'),
    JSON.stringify({ decision: { classifier: 'spark' } }),
  );

  const payload = buildMockModRequest({
    cwd: ctx.repo,
    toolName: 'Read',
    toolInput: { file_path: join(ctx.repo, 'file.ts') },
  });

  const exitCode = await runCLI(['run', '--jev-only'], {
    stdin: () => Promise.resolve(JSON.stringify(payload)),
    stdout: ctx.stdout,
    stderr: ctx.stderr,
    host: ctx.host,
    signal: ctx.signal,
  });

  expect({ exitCode, stdout: ctx.stdout.read(), stderr: ctx.stderr.read() }).toStrictEqual({
    exitCode: 0,
    stdout: '',
    stderr: 'auto-mode: Jev-only evaluation requires system-one; no verdict\n',
  });
});

test('it accepts a local allowance through Jev-only mode', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.dir, 'auto-mode'));

  await writeFile(
    join(ctx.dir, 'auto-mode', 'config.json'),
    JSON.stringify({ decision: { classifier: 'jev' } }),
  );

  const payload = buildMockModRequest({
    cwd: ctx.repo,
    toolName: 'Read',
    toolInput: { file_path: join(ctx.repo, 'file.ts') },
  });

  const exitCode = await runCLI(['run', '--jev-only'], {
    stdin: () => Promise.resolve(JSON.stringify(payload)),
    stdout: ctx.stdout,
    stderr: ctx.stderr,
    host: ctx.host,
    signal: ctx.signal,
  });

  expect({ exitCode, stdout: ctx.stdout.read(), stderr: ctx.stderr.read() }).toStrictEqual({
    exitCode: 0,
    stdout: '{"decision":"allow"}',
    stderr: '',
  });
});

// The key is set and the preset's API host has no handler, so a model call
// would fail the run instead of allowing.
test('it allows a local allowance without a model call when a provider key is configured', async () => {
  const ctx = await setupTest();

  const payload = buildMockModRequest({
    cwd: ctx.repo,
    toolName: 'Read',
    toolInput: { file_path: join(ctx.repo, 'file.ts') },
  });

  const exitCode = await runCLI(['run', '--explain'], {
    stdin: () => Promise.resolve(JSON.stringify(payload)),
    stdout: ctx.stdout,
    stderr: ctx.stderr,
    host: { ...ctx.host, env: { ...ctx.host.env, TYPESAFE_API_KEY: 'cli-test-key' } },
    signal: ctx.signal,
  });

  expect({ exitCode, stdout: ctx.stdout.read(), stderr: ctx.stderr.read() }).toStrictEqual({
    exitCode: 0,
    stdout: '{"decision":"allow"}',
    stderr: 'auto-mode: allowed by Read-only actions (local)\n',
  });
});

test('it refuses an evaluation deadline outside Jev-only mode', async () => {
  const ctx = await setupTest();

  const payload = buildMockModRequest({
    cwd: ctx.repo,
    toolName: 'Read',
    toolInput: { file_path: join(ctx.repo, 'file.ts') },
  });

  const exitCode = await runCLI(['run', '--evaluation-deadline', '1'], {
    stdin: () => Promise.resolve(JSON.stringify(payload)),
    stdout: ctx.stdout,
    stderr: ctx.stderr,
    host: ctx.host,
    signal: ctx.signal,
  });

  expect({ exitCode, stdout: ctx.stdout.read(), stderr: ctx.stderr.read() }).toStrictEqual({
    exitCode: 0,
    stdout: '',
    stderr: 'auto-mode: invalid Jev evaluation deadline; no verdict\n',
  });
});

test('it prints the assembled prompt with no marker left behind', async () => {
  const ctx = await setupTest();

  const exitCode = await runCLI(['print-prompt'], {
    stdin: () => Promise.resolve(''),
    stdout: ctx.stdout,
    stderr: ctx.stderr,
    host: ctx.host,
    signal: ctx.signal,
  });

  expect({ exitCode, stdout: ctx.stdout.read(), stderr: ctx.stderr.read() }).toStrictEqual({
    exitCode: 0,
    stdout: expect.toInclude('## HARD BLOCK rules'),
    stderr: '',
  });

  expect(ctx.stdout.read()).not.toInclude('<rules>');
});

test('it reads an overridden policy instead of the shipped one', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.dir, 'classifier.md'), 'framework\n\n<rules>\n');
  await writeFile(join(ctx.dir, 'rules.md'), 'the rules');

  const exitCode = await runCLI(
    [
      'print-prompt',
      '--classifier',
      join(ctx.dir, 'classifier.md'),
      '--rules',
      join(ctx.dir, 'rules.md'),
    ],
    {
      stdin: () => Promise.resolve(''),
      stdout: ctx.stdout,
      stderr: ctx.stderr,
      host: ctx.host,
      signal: ctx.signal,
    },
  );

  expect({ exitCode, stdout: ctx.stdout.read(), stderr: ctx.stderr.read() }).toStrictEqual({
    exitCode: 0,
    stdout: 'framework\n\nthe rules\n\n',
    stderr: '',
  });
});

// The CLI always exits 0. The mod reads a non-zero exit as a failure, and the
// JSON on stdout is what decides the outcome.
test.each([
  ['stdin that is not JSON', 'not json at all'],
  ['a body that is not an object', '"a string"'],
  [
    'a Claude Code hook payload',
    '{"prompt_id":"p","hook_event_name":"PermissionRequest","tool_name":"Read","tool_input":{}}',
  ],
])('it writes nothing and exits 0 on %s', async (_label, stdin) => {
  const ctx = await setupTest();

  const exitCode = await runCLI(['run', '--local-only'], {
    stdin: () => Promise.resolve(stdin),
    stdout: ctx.stdout,
    stderr: ctx.stderr,
    host: ctx.host,
    signal: ctx.signal,
  });

  expect({ exitCode, stdout: ctx.stdout.read(), stderr: ctx.stderr.read() }).toStrictEqual({
    exitCode: 0,
    stdout: '',
    stderr: '',
  });
});

test('it explains its reasoning on stderr when asked, never on stdout', async () => {
  const ctx = await setupTest();

  const payload = buildMockModRequest({
    cwd: ctx.repo,
    toolName: 'Bash',
    toolInput: { command: 'rm -rf dist' },
  });

  const exitCode = await runCLI(['run', '--local-only', '--explain'], {
    stdin: () => Promise.resolve(JSON.stringify(payload)),
    stdout: ctx.stdout,
    stderr: ctx.stderr,
    host: ctx.host,
    signal: ctx.signal,
  });

  expect({ exitCode, stdout: ctx.stdout.read(), stderr: ctx.stderr.read() }).toStrictEqual({
    exitCode: 0,
    stdout: '{"decision":"allow"}',
    stderr: 'auto-mode: allowed by Regenerable output (local)\n',
  });
});

test('it stays silent on stderr when not asked to explain', async () => {
  const ctx = await setupTest();

  const payload = buildMockModRequest({
    cwd: ctx.repo,
    toolName: 'Bash',
    toolInput: { command: 'rm -rf dist' },
  });

  const exitCode = await runCLI(['run', '--local-only'], {
    stdin: () => Promise.resolve(JSON.stringify(payload)),
    stdout: ctx.stdout,
    stderr: ctx.stderr,
    host: ctx.host,
    signal: ctx.signal,
  });

  expect({ exitCode, stdout: ctx.stdout.read(), stderr: ctx.stderr.read() }).toStrictEqual({
    exitCode: 0,
    stdout: '{"decision":"allow"}',
    stderr: '',
  });
});

test('it escalates local allowances when imported deny rules need evaluation', async () => {
  const ctx = await setupTest();

  await writeFile(
    join(ctx.dir, 'settings.json'),
    JSON.stringify({ autoMode: { hard_deny: ['Never read the private key'] } }),
  );

  const payload = buildMockModRequest({
    cwd: ctx.repo,
    toolName: 'Read',
    toolInput: { file_path: join(ctx.repo, 'key.pem') },
  });

  const exitCode = await runCLI(['run', '--local-only', '--explain'], {
    stdin: () => Promise.resolve(JSON.stringify(payload)),
    stdout: ctx.stdout,
    stderr: ctx.stderr,
    host: ctx.host,
    signal: ctx.signal,
  });

  expect({ exitCode, stdout: ctx.stdout.read(), stderr: ctx.stderr.read() }).toStrictEqual({
    exitCode: 0,
    stdout: '',
    stderr: 'auto-mode: Read needs the model tier, which this run skipped\n',
  });
});

test('it honors fail-closed settings when Claude rules are malformed without printing their contents', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.dir, 'auto-mode'));

  await writeFile(
    join(ctx.dir, 'auto-mode', 'config.json'),
    JSON.stringify({
      decision: { onFailure: 'deny', denialBudget: { consecutive: 3, perSession: 20 } },
    }),
  );

  await writeFile(join(ctx.dir, 'settings.json'), 'private-test-value {');

  const payload = buildMockModRequest({
    cwd: ctx.repo,
    toolName: 'Read',
    toolInput: { file_path: join(ctx.repo, 'file.ts') },
  });

  const exitCode = await runCLI(['run'], {
    stdin: () => Promise.resolve(JSON.stringify(payload)),
    stdout: ctx.stdout,
    stderr: ctx.stderr,
    host: ctx.host,
    signal: ctx.signal,
  });

  expect({ exitCode, stdout: ctx.stdout.read(), stderr: ctx.stderr.read() }).toStrictEqual({
    exitCode: 0,
    stdout: JSON.stringify({
      decision: 'deny',
      reason:
        '[Classifier Unavailable] Claude settings unreadable. Do not retry this action, and do not reach the same result another way: not with a different command, tool, script, file, or agent. Continue the task on a safer path that does not need this action. If no safer path exists for this step, finish the rest of the task first, then tell the user what you need from them for this step. Denials left before auto-mode asks the user: 2.',
    }),
    stderr: 'auto-mode: Claude settings unreadable; classifier unavailable\n',
  });
});

test('it exits successfully on malformed classifier configuration without echoing it', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.dir, 'auto-mode'));
  await writeFile(join(ctx.dir, 'auto-mode', 'config.json'), 'private-test-value {');

  const payload = buildMockModRequest({
    cwd: ctx.repo,
    toolName: 'Read',
    toolInput: { file_path: join(ctx.repo, 'file.ts') },
  });

  const exitCode = await runCLI(['run'], {
    stdin: () => Promise.resolve(JSON.stringify(payload)),
    stdout: ctx.stdout,
    stderr: ctx.stderr,
    host: ctx.host,
    signal: ctx.signal,
  });

  expect({ exitCode, stdout: ctx.stdout.read(), stderr: ctx.stderr.read() }).toStrictEqual({
    exitCode: 0,
    stdout: '',
    stderr: 'auto-mode: configuration unreadable; no verdict\n',
  });

  const log = await readFile(join(ctx.dir, 'actions.jsonl'), 'utf8');

  expect(
    log
      .trim()
      .split('\n')
      .map((line): unknown => JSON.parse(line)),
  ).toStrictEqual([
    {
      schemaVersion: 3,
      time: expect.toBeDateString(),
      invocationID: expect.toBeString(),
      sessionHash: expect.toBeString(),
      actionHash: expect.toBeString(),
      status: 'started',
      verdict: null,
      decidingStage: null,
      denials: null,
      escalation: false,
      diagnostics: null,
    },
    {
      schemaVersion: 3,
      time: expect.toBeDateString(),
      invocationID: expect.toBeString(),
      sessionHash: expect.toBeString(),
      actionHash: expect.toBeString(),
      status: 'failure',
      verdict: 'defer',
      decidingStage: null,
      denials: null,
      escalation: false,
      diagnostics: null,
    },
  ]);
});

test('it counts down to one denial left on the second denial in a row', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.dir, 'auto-mode'));

  await writeFile(
    join(ctx.dir, 'auto-mode', 'config.json'),
    JSON.stringify({
      decision: { onFailure: 'deny', denialBudget: { consecutive: 3, perSession: 20 } },
    }),
  );

  await writeFile(join(ctx.dir, 'settings.json'), 'not json {');

  for (const command of ['git push a']) {
    const payload = buildMockModRequest({
      sessionID: 'cli-session',
      cwd: ctx.repo,
      toolName: 'Bash',
      toolInput: { command },
      context: { agentID: null },
    });

    await runCLI(['run'], {
      stdin: () => Promise.resolve(JSON.stringify(payload)),
      stdout: buildStubOutput(),
      stderr: buildStubOutput(),
      host: ctx.host,
      signal: ctx.signal,
    });
  }

  const payload = buildMockModRequest({
    sessionID: 'cli-session',
    cwd: ctx.repo,
    toolName: 'Bash',
    toolInput: { command: 'git push b' },
    context: { agentID: null },
  });

  const exitCode = await runCLI(['run'], {
    stdin: () => Promise.resolve(JSON.stringify(payload)),
    stdout: ctx.stdout,
    stderr: ctx.stderr,
    host: ctx.host,
    signal: ctx.signal,
  });

  const log = await readFile(join(ctx.dir, 'actions.jsonl'), 'utf8');

  const finals = log
    .trim()
    .split('\n')
    .filter((line) => !line.includes('"status":"started"'))
    .map((line): unknown => JSON.parse(line));

  expect({ exitCode, stdout: ctx.stdout.read(), stderr: ctx.stderr.read() }).toStrictEqual({
    exitCode: 0,
    stdout: JSON.stringify({
      decision: 'deny',
      reason:
        '[Classifier Unavailable] Claude settings unreadable. Do not retry this action, and do not reach the same result another way: not with a different command, tool, script, file, or agent. Continue the task on a safer path that does not need this action. If no safer path exists for this step, finish the rest of the task first, then tell the user what you need from them for this step. Denials left before auto-mode asks the user: 1.',
    }),
    stderr: 'auto-mode: Claude settings unreadable; classifier unavailable\n',
  });

  expect(finals).toStrictEqual([
    {
      schemaVersion: 3,
      time: expect.toBeDateString(),
      invocationID: expect.toBeString(),
      sessionHash: expect.toBeString(),
      actionHash: expect.toBeString(),
      status: 'failure',
      verdict: 'deny',
      decidingStage: 'jev',
      denials: { consecutive: 1, session: 1 },
      escalation: false,
      diagnostics: null,
    },
    {
      schemaVersion: 3,
      time: expect.toBeDateString(),
      invocationID: expect.toBeString(),
      sessionHash: expect.toBeString(),
      actionHash: expect.toBeString(),
      status: 'failure',
      verdict: 'deny',
      decidingStage: 'jev',
      denials: { consecutive: 2, session: 2 },
      escalation: false,
      diagnostics: null,
    },
  ]);
});

test('it warns on the third denial in a row that it is the last before the user decides', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.dir, 'auto-mode'));

  await writeFile(
    join(ctx.dir, 'auto-mode', 'config.json'),
    JSON.stringify({
      decision: { onFailure: 'deny', denialBudget: { consecutive: 3, perSession: 20 } },
    }),
  );

  await writeFile(join(ctx.dir, 'settings.json'), 'not json {');

  for (const command of ['git push a', 'git push b']) {
    const payload = buildMockModRequest({
      sessionID: 'cli-session',
      cwd: ctx.repo,
      toolName: 'Bash',
      toolInput: { command },
      context: { agentID: null },
    });

    await runCLI(['run'], {
      stdin: () => Promise.resolve(JSON.stringify(payload)),
      stdout: buildStubOutput(),
      stderr: buildStubOutput(),
      host: ctx.host,
      signal: ctx.signal,
    });
  }

  const payload = buildMockModRequest({
    sessionID: 'cli-session',
    cwd: ctx.repo,
    toolName: 'Bash',
    toolInput: { command: 'git push c' },
    context: { agentID: null },
  });

  const exitCode = await runCLI(['run'], {
    stdin: () => Promise.resolve(JSON.stringify(payload)),
    stdout: ctx.stdout,
    stderr: ctx.stderr,
    host: ctx.host,
    signal: ctx.signal,
  });

  const log = await readFile(join(ctx.dir, 'actions.jsonl'), 'utf8');

  const finals = log
    .trim()
    .split('\n')
    .filter((line) => !line.includes('"status":"started"'))
    .map((line): unknown => JSON.parse(line));

  expect({ exitCode, stdout: ctx.stdout.read(), stderr: ctx.stderr.read() }).toStrictEqual({
    exitCode: 0,
    stdout: JSON.stringify({
      decision: 'deny',
      reason:
        '[Classifier Unavailable] Claude settings unreadable. Do not retry this action, and do not reach the same result another way: not with a different command, tool, script, file, or agent. Continue the task on a safer path that does not need this action. If no safer path exists for this step, finish the rest of the task first, then tell the user what you need from them for this step. This is the last denial before auto-mode asks the user. Stop now, without finishing the rest of the task, and tell the user what consent you need to continue.',
    }),
    stderr: 'auto-mode: Claude settings unreadable; classifier unavailable\n',
  });

  expect(finals).toStrictEqual([
    {
      schemaVersion: 3,
      time: expect.toBeDateString(),
      invocationID: expect.toBeString(),
      sessionHash: expect.toBeString(),
      actionHash: expect.toBeString(),
      status: 'failure',
      verdict: 'deny',
      decidingStage: 'jev',
      denials: { consecutive: 1, session: 1 },
      escalation: false,
      diagnostics: null,
    },
    {
      schemaVersion: 3,
      time: expect.toBeDateString(),
      invocationID: expect.toBeString(),
      sessionHash: expect.toBeString(),
      actionHash: expect.toBeString(),
      status: 'failure',
      verdict: 'deny',
      decidingStage: 'jev',
      denials: { consecutive: 2, session: 2 },
      escalation: false,
      diagnostics: null,
    },
    {
      schemaVersion: 3,
      time: expect.toBeDateString(),
      invocationID: expect.toBeString(),
      sessionHash: expect.toBeString(),
      actionHash: expect.toBeString(),
      status: 'failure',
      verdict: 'deny',
      decidingStage: 'jev',
      denials: { consecutive: 3, session: 3 },
      escalation: false,
      diagnostics: null,
    },
  ]);
});

test('it leaves the fourth action in a row to the user after three denials', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.dir, 'auto-mode'));

  await writeFile(
    join(ctx.dir, 'auto-mode', 'config.json'),
    JSON.stringify({
      decision: { onFailure: 'deny', denialBudget: { consecutive: 3, perSession: 20 } },
    }),
  );

  await writeFile(join(ctx.dir, 'settings.json'), 'not json {');

  for (const command of ['git push a', 'git push b', 'git push c']) {
    const payload = buildMockModRequest({
      sessionID: 'cli-session',
      cwd: ctx.repo,
      toolName: 'Bash',
      toolInput: { command },
      context: { agentID: null },
    });

    await runCLI(['run'], {
      stdin: () => Promise.resolve(JSON.stringify(payload)),
      stdout: buildStubOutput(),
      stderr: buildStubOutput(),
      host: ctx.host,
      signal: ctx.signal,
    });
  }

  const payload = buildMockModRequest({
    sessionID: 'cli-session',
    cwd: ctx.repo,
    toolName: 'Bash',
    toolInput: { command: 'git push d' },
    context: { agentID: null },
  });

  const exitCode = await runCLI(['run'], {
    stdin: () => Promise.resolve(JSON.stringify(payload)),
    stdout: ctx.stdout,
    stderr: ctx.stderr,
    host: ctx.host,
    signal: ctx.signal,
  });

  const log = await readFile(join(ctx.dir, 'actions.jsonl'), 'utf8');

  const finals = log
    .trim()
    .split('\n')
    .filter((line) => !line.includes('"status":"started"'))
    .map((line): unknown => JSON.parse(line));

  expect({ exitCode, stdout: ctx.stdout.read(), stderr: ctx.stderr.read() }).toStrictEqual({
    exitCode: 0,
    stdout: '',
    stderr: 'auto-mode: denial budget exhausted; the user decides this action\n',
  });

  expect(finals).toStrictEqual([
    {
      schemaVersion: 3,
      time: expect.toBeDateString(),
      invocationID: expect.toBeString(),
      sessionHash: expect.toBeString(),
      actionHash: expect.toBeString(),
      status: 'failure',
      verdict: 'deny',
      decidingStage: 'jev',
      denials: { consecutive: 1, session: 1 },
      escalation: false,
      diagnostics: null,
    },
    {
      schemaVersion: 3,
      time: expect.toBeDateString(),
      invocationID: expect.toBeString(),
      sessionHash: expect.toBeString(),
      actionHash: expect.toBeString(),
      status: 'failure',
      verdict: 'deny',
      decidingStage: 'jev',
      denials: { consecutive: 2, session: 2 },
      escalation: false,
      diagnostics: null,
    },
    {
      schemaVersion: 3,
      time: expect.toBeDateString(),
      invocationID: expect.toBeString(),
      sessionHash: expect.toBeString(),
      actionHash: expect.toBeString(),
      status: 'failure',
      verdict: 'deny',
      decidingStage: 'jev',
      denials: { consecutive: 3, session: 3 },
      escalation: false,
      diagnostics: null,
    },
    {
      schemaVersion: 3,
      time: expect.toBeDateString(),
      invocationID: expect.toBeString(),
      sessionHash: expect.toBeString(),
      actionHash: expect.toBeString(),
      status: 'failure',
      verdict: 'defer',
      decidingStage: 'budget',
      denials: { consecutive: 0, session: 0 },
      escalation: true,
      diagnostics: null,
    },
  ]);
});

test('it starts the denial count over after the user decides an action', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.dir, 'auto-mode'));

  await writeFile(
    join(ctx.dir, 'auto-mode', 'config.json'),
    JSON.stringify({
      decision: { onFailure: 'deny', denialBudget: { consecutive: 3, perSession: 20 } },
    }),
  );

  await writeFile(join(ctx.dir, 'settings.json'), 'not json {');

  for (const command of ['git push a', 'git push b', 'git push c', 'git push d']) {
    const payload = buildMockModRequest({
      sessionID: 'cli-session',
      cwd: ctx.repo,
      toolName: 'Bash',
      toolInput: { command },
      context: { agentID: null },
    });

    await runCLI(['run'], {
      stdin: () => Promise.resolve(JSON.stringify(payload)),
      stdout: buildStubOutput(),
      stderr: buildStubOutput(),
      host: ctx.host,
      signal: ctx.signal,
    });
  }

  const payload = buildMockModRequest({
    sessionID: 'cli-session',
    cwd: ctx.repo,
    toolName: 'Bash',
    toolInput: { command: 'git push e' },
    context: { agentID: null },
  });

  const exitCode = await runCLI(['run'], {
    stdin: () => Promise.resolve(JSON.stringify(payload)),
    stdout: ctx.stdout,
    stderr: ctx.stderr,
    host: ctx.host,
    signal: ctx.signal,
  });

  const log = await readFile(join(ctx.dir, 'actions.jsonl'), 'utf8');

  const finals = log
    .trim()
    .split('\n')
    .filter((line) => !line.includes('"status":"started"'))
    .map((line): unknown => JSON.parse(line));

  expect({ exitCode, stdout: ctx.stdout.read(), stderr: ctx.stderr.read() }).toStrictEqual({
    exitCode: 0,
    stdout: JSON.stringify({
      decision: 'deny',
      reason:
        '[Classifier Unavailable] Claude settings unreadable. Do not retry this action, and do not reach the same result another way: not with a different command, tool, script, file, or agent. Continue the task on a safer path that does not need this action. If no safer path exists for this step, finish the rest of the task first, then tell the user what you need from them for this step. Denials left before auto-mode asks the user: 2.',
    }),
    stderr: 'auto-mode: Claude settings unreadable; classifier unavailable\n',
  });

  expect(finals).toStrictEqual([
    {
      schemaVersion: 3,
      time: expect.toBeDateString(),
      invocationID: expect.toBeString(),
      sessionHash: expect.toBeString(),
      actionHash: expect.toBeString(),
      status: 'failure',
      verdict: 'deny',
      decidingStage: 'jev',
      denials: { consecutive: 1, session: 1 },
      escalation: false,
      diagnostics: null,
    },
    {
      schemaVersion: 3,
      time: expect.toBeDateString(),
      invocationID: expect.toBeString(),
      sessionHash: expect.toBeString(),
      actionHash: expect.toBeString(),
      status: 'failure',
      verdict: 'deny',
      decidingStage: 'jev',
      denials: { consecutive: 2, session: 2 },
      escalation: false,
      diagnostics: null,
    },
    {
      schemaVersion: 3,
      time: expect.toBeDateString(),
      invocationID: expect.toBeString(),
      sessionHash: expect.toBeString(),
      actionHash: expect.toBeString(),
      status: 'failure',
      verdict: 'deny',
      decidingStage: 'jev',
      denials: { consecutive: 3, session: 3 },
      escalation: false,
      diagnostics: null,
    },
    {
      schemaVersion: 3,
      time: expect.toBeDateString(),
      invocationID: expect.toBeString(),
      sessionHash: expect.toBeString(),
      actionHash: expect.toBeString(),
      status: 'failure',
      verdict: 'defer',
      decidingStage: 'budget',
      denials: { consecutive: 0, session: 0 },
      escalation: true,
      diagnostics: null,
    },
    {
      schemaVersion: 3,
      time: expect.toBeDateString(),
      invocationID: expect.toBeString(),
      sessionHash: expect.toBeString(),
      actionHash: expect.toBeString(),
      status: 'failure',
      verdict: 'deny',
      decidingStage: 'jev',
      denials: { consecutive: 1, session: 1 },
      escalation: false,
      diagnostics: null,
    },
  ]);
});

test('it denies a retry of the action just denied without asking the classifier', async () => {
  const ctx = await setupTest();

  const payload = buildMockModRequest({
    sessionID: 'cli-session',
    cwd: ctx.repo,
    toolName: 'Bash',
    toolInput: { command: 'git push origin main' },
    context: { agentID: null },
  });

  await mkdir(join(ctx.dir, 'auto-mode'));

  await writeFile(
    join(ctx.dir, 'auto-mode', 'config.json'),
    JSON.stringify({
      decision: { onFailure: 'deny', denialBudget: { consecutive: 3, perSession: 20 } },
    }),
  );

  await writeFile(join(ctx.dir, 'settings.json'), 'not json {');

  await runCLI(['run'], {
    stdin: () => Promise.resolve(JSON.stringify(payload)),
    stdout: buildStubOutput(),
    stderr: buildStubOutput(),
    host: ctx.host,
    signal: ctx.signal,
  });

  // Readable settings now would let the classifier tier run; the retry must not reach it.
  await writeFile(join(ctx.dir, 'settings.json'), '{}');

  const exitCode = await runCLI(['run'], {
    stdin: () => Promise.resolve(JSON.stringify(payload)),
    stdout: ctx.stdout,
    stderr: ctx.stderr,
    host: ctx.host,
    signal: ctx.signal,
  });

  const log = await readFile(join(ctx.dir, 'actions.jsonl'), 'utf8');

  const last = log.trim().split('\n').at(-1);

  invariant(last !== undefined, 'the run wrote a diagnostic record');

  expect({ exitCode, stdout: ctx.stdout.read(), stderr: ctx.stderr.read() }).toStrictEqual({
    exitCode: 0,
    stdout: JSON.stringify({
      decision: 'deny',
      reason:
        '[Classifier Unavailable] Claude settings unreadable. Do not retry this action, and do not reach the same result another way: not with a different command, tool, script, file, or agent. Continue the task on a safer path that does not need this action. If no safer path exists for this step, finish the rest of the task first, then tell the user what you need from them for this step. Denials left before auto-mode asks the user: 1.',
    }),
    stderr: '',
  });

  expect(JSON.parse(last)).toStrictEqual({
    schemaVersion: 3,
    time: expect.toBeDateString(),
    invocationID: expect.toBeString(),
    sessionHash: expect.toBeString(),
    actionHash: expect.toBeString(),
    status: 'deny',
    verdict: 'deny',
    decidingStage: 'retry',
    denials: { consecutive: 2, session: 2 },
    escalation: false,
    diagnostics: null,
  });
});

test('it states that the first denial is the last under a budget of one in a row', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.dir, 'auto-mode'));

  await writeFile(
    join(ctx.dir, 'auto-mode', 'config.json'),
    JSON.stringify({
      decision: { onFailure: 'deny', denialBudget: { consecutive: 1, perSession: 20 } },
    }),
  );

  await writeFile(join(ctx.dir, 'settings.json'), 'not json {');

  const payload = buildMockModRequest({
    sessionID: 'cli-session',
    cwd: ctx.repo,
    toolName: 'Bash',
    toolInput: { command: 'git push a' },
    context: { agentID: null },
  });

  const exitCode = await runCLI(['run'], {
    stdin: () => Promise.resolve(JSON.stringify(payload)),
    stdout: ctx.stdout,
    stderr: ctx.stderr,
    host: ctx.host,
    signal: ctx.signal,
  });

  expect({ exitCode, stdout: ctx.stdout.read(), stderr: ctx.stderr.read() }).toStrictEqual({
    exitCode: 0,
    stdout: JSON.stringify({
      decision: 'deny',
      reason:
        '[Classifier Unavailable] Claude settings unreadable. Do not retry this action, and do not reach the same result another way: not with a different command, tool, script, file, or agent. Continue the task on a safer path that does not need this action. If no safer path exists for this step, finish the rest of the task first, then tell the user what you need from them for this step. This is the last denial before auto-mode asks the user. Stop now, without finishing the rest of the task, and tell the user what consent you need to continue.',
    }),
    stderr: 'auto-mode: Claude settings unreadable; classifier unavailable\n',
  });
});

test('it keeps the denial count across runs for a resumed session', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.dir, 'auto-mode'));

  await writeFile(
    join(ctx.dir, 'auto-mode', 'config.json'),
    JSON.stringify({
      decision: { onFailure: 'deny', denialBudget: { consecutive: 1, perSession: 20 } },
    }),
  );

  await writeFile(join(ctx.dir, 'settings.json'), 'not json {');

  const first = buildMockModRequest({
    sessionID: 'cli-session',
    cwd: ctx.repo,
    toolName: 'Bash',
    toolInput: { command: 'git push a' },
    context: { agentID: null },
  });

  const resumed = buildMockModRequest({
    sessionID: 'cli-session',
    cwd: ctx.repo,
    toolName: 'Bash',
    toolInput: { command: 'git push b' },
    context: { agentID: null },
  });

  await runCLI(['run'], {
    stdin: () => Promise.resolve(JSON.stringify(first)),
    stdout: buildStubOutput(),
    stderr: buildStubOutput(),
    host: ctx.host,
    signal: ctx.signal,
  });

  const exitCode = await runCLI(['run'], {
    stdin: () => Promise.resolve(JSON.stringify(resumed)),
    stdout: ctx.stdout,
    stderr: ctx.stderr,
    host: ctx.host,
    signal: ctx.signal,
  });

  const log = await readFile(join(ctx.dir, 'actions.jsonl'), 'utf8');

  const last = log.trim().split('\n').at(-1);

  invariant(last !== undefined, 'the run wrote a diagnostic record');

  expect({ exitCode, stdout: ctx.stdout.read(), stderr: ctx.stderr.read() }).toStrictEqual({
    exitCode: 0,
    stdout: '',
    stderr: 'auto-mode: denial budget exhausted; the user decides this action\n',
  });

  expect(JSON.parse(last)).toStrictEqual({
    schemaVersion: 3,
    time: expect.toBeDateString(),
    invocationID: expect.toBeString(),
    sessionHash: expect.toBeString(),
    actionHash: expect.toBeString(),
    status: 'failure',
    verdict: 'defer',
    decidingStage: 'budget',
    denials: { consecutive: 0, session: 0 },
    escalation: true,
    diagnostics: null,
  });
});

test("it keeps a subagent's denial count apart from its session's", async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.dir, 'auto-mode'));

  await writeFile(
    join(ctx.dir, 'auto-mode', 'config.json'),
    JSON.stringify({
      decision: { onFailure: 'deny', denialBudget: { consecutive: 1, perSession: 20 } },
    }),
  );

  await writeFile(join(ctx.dir, 'settings.json'), 'not json {');

  const main = buildMockModRequest({
    sessionID: 'cli-session',
    cwd: ctx.repo,
    toolName: 'Bash',
    toolInput: { command: 'git push a' },
    context: { agentID: null },
  });

  const child = buildMockModRequest({
    sessionID: 'cli-session',
    cwd: ctx.repo,
    toolName: 'Bash',
    toolInput: { command: 'git push c' },
    context: { agentID: 'subagent' },
  });

  await runCLI(['run'], {
    stdin: () => Promise.resolve(JSON.stringify(main)),
    stdout: buildStubOutput(),
    stderr: buildStubOutput(),
    host: ctx.host,
    signal: ctx.signal,
  });

  const exitCode = await runCLI(['run'], {
    stdin: () => Promise.resolve(JSON.stringify(child)),
    stdout: ctx.stdout,
    stderr: ctx.stderr,
    host: ctx.host,
    signal: ctx.signal,
  });

  expect({ exitCode, stdout: ctx.stdout.read(), stderr: ctx.stderr.read() }).toStrictEqual({
    exitCode: 0,
    stdout: JSON.stringify({
      decision: 'deny',
      reason:
        '[Classifier Unavailable] Claude settings unreadable. Do not retry this action, and do not reach the same result another way: not with a different command, tool, script, file, or agent. Continue the task on a safer path that does not need this action. If no safer path exists for this step, finish the rest of the task first, then tell the user what you need from them for this step. This is the last denial before auto-mode asks the user. Stop now, without finishing the rest of the task, and tell the user what consent you need to continue.',
    }),
    stderr: 'auto-mode: Claude settings unreadable; classifier unavailable\n',
  });
});

test("it leaves the session's denial streak alone when its subagent is denied in between", async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.dir, 'auto-mode'));

  await writeFile(
    join(ctx.dir, 'auto-mode', 'config.json'),
    JSON.stringify({
      decision: { onFailure: 'deny', denialBudget: { consecutive: 2, perSession: 20 } },
    }),
  );

  await writeFile(join(ctx.dir, 'settings.json'), 'not json {');

  const first = buildMockModRequest({
    sessionID: 'cli-session',
    cwd: ctx.repo,
    toolName: 'Bash',
    toolInput: { command: 'git push a' },
    context: { agentID: null },
  });

  const child = buildMockModRequest({
    sessionID: 'cli-session',
    cwd: ctx.repo,
    toolName: 'Bash',
    toolInput: { command: 'git push b' },
    context: { agentID: 'subagent' },
  });

  const second = buildMockModRequest({
    sessionID: 'cli-session',
    cwd: ctx.repo,
    toolName: 'Bash',
    toolInput: { command: 'git push c' },
    context: { agentID: null },
  });

  await runCLI(['run'], {
    stdin: () => Promise.resolve(JSON.stringify(first)),
    stdout: buildStubOutput(),
    stderr: buildStubOutput(),
    host: ctx.host,
    signal: ctx.signal,
  });

  await runCLI(['run'], {
    stdin: () => Promise.resolve(JSON.stringify(child)),
    stdout: buildStubOutput(),
    stderr: buildStubOutput(),
    host: ctx.host,
    signal: ctx.signal,
  });

  const exitCode = await runCLI(['run'], {
    stdin: () => Promise.resolve(JSON.stringify(second)),
    stdout: ctx.stdout,
    stderr: ctx.stderr,
    host: ctx.host,
    signal: ctx.signal,
  });

  expect({ exitCode, stdout: ctx.stdout.read(), stderr: ctx.stderr.read() }).toStrictEqual({
    exitCode: 0,
    stdout: JSON.stringify({
      decision: 'deny',
      reason:
        '[Classifier Unavailable] Claude settings unreadable. Do not retry this action, and do not reach the same result another way: not with a different command, tool, script, file, or agent. Continue the task on a safer path that does not need this action. If no safer path exists for this step, finish the rest of the task first, then tell the user what you need from them for this step. This is the last denial before auto-mode asks the user. Stop now, without finishing the rest of the task, and tell the user what consent you need to continue.',
    }),
    stderr: 'auto-mode: Claude settings unreadable; classifier unavailable\n',
  });
});

test('it records a finished Bash call without writing a verdict', async () => {
  const ctx = await setupTest();

  runGit(ctx.dir, ['-C', ctx.repo, 'commit', '-q', '--allow-empty', '-m', 'init']);

  const startedAt = Date.now();

  runGit(ctx.dir, ['-C', ctx.repo, 'worktree', 'add', '-q', '.worktrees/x', '-b', 'feat/x']);

  const record = {
    sessionID: 'cli-session',
    cwd: ctx.repo,
    startedAt,
    command: 'git worktree add .worktrees/x -b feat/x',
    resultText: '',
  };

  const exitCode = await runCLI(['record'], {
    stdin: () => Promise.resolve(JSON.stringify(record)),
    stdout: ctx.stdout,
    stderr: ctx.stderr,
    host: ctx.host,
    signal: ctx.signal,
  });

  expect({ exitCode, stdout: ctx.stdout.read(), stderr: ctx.stderr.read() }).toStrictEqual({
    exitCode: 0,
    stdout: '',
    stderr: '',
  });
});

test('it ignores a record body that is not JSON', async () => {
  const ctx = await setupTest();

  const exitCode = await runCLI(['record'], {
    stdin: () => Promise.resolve('not json at all'),
    stdout: ctx.stdout,
    stderr: ctx.stderr,
    host: ctx.host,
    signal: ctx.signal,
  });

  expect({ exitCode, stdout: ctx.stdout.read(), stderr: ctx.stderr.read() }).toStrictEqual({
    exitCode: 0,
    stdout: '',
    stderr: '',
  });
});

test('it keeps a branch the session created in its scope across runs', async () => {
  const ctx = await setupTest();

  runGit(ctx.dir, ['-C', ctx.repo, 'remote', 'add', 'origin', 'git@github.com:dev/app.git']);
  runGit(ctx.dir, ['-C', ctx.repo, 'commit', '-q', '--allow-empty', '-m', 'init']);

  const startedAt = Date.now();

  runGit(ctx.dir, ['-C', ctx.repo, 'worktree', 'add', '-q', '.worktrees/x', '-b', 'feat/x']);

  const record = {
    sessionID: 'cli-session',
    cwd: ctx.repo,
    startedAt,
    command: 'git worktree add .worktrees/x -b feat/x',
    resultText: '',
  };

  const push = buildMockModRequest({
    sessionID: 'cli-session',
    cwd: ctx.repo,
    toolName: 'Bash',
    toolInput: { command: 'git push origin feat/x' },
    context: { agentID: null },
  });

  await runCLI(['record'], {
    stdin: () => Promise.resolve(JSON.stringify(record)),
    stdout: buildStubOutput(),
    stderr: buildStubOutput(),
    host: ctx.host,
    signal: ctx.signal,
  });

  const exitCode = await runCLI(['run', '--local-only', '--explain'], {
    stdin: () => Promise.resolve(JSON.stringify(push)),
    stdout: ctx.stdout,
    stderr: ctx.stderr,
    host: ctx.host,
    signal: ctx.signal,
  });

  expect({ exitCode, stdout: ctx.stdout.read(), stderr: ctx.stderr.read() }).toStrictEqual({
    exitCode: 0,
    stdout: '',
    stderr: 'auto-mode: Bash needs the model tier, which this run skipped\n',
  });
});

test("it keeps a branch one session created out of another session's scope", async () => {
  const ctx = await setupTest();

  runGit(ctx.dir, ['-C', ctx.repo, 'remote', 'add', 'origin', 'git@github.com:dev/app.git']);
  runGit(ctx.dir, ['-C', ctx.repo, 'commit', '-q', '--allow-empty', '-m', 'init']);

  const startedAt = Date.now();

  runGit(ctx.dir, ['-C', ctx.repo, 'worktree', 'add', '-q', '.worktrees/x', '-b', 'feat/x']);

  const record = {
    sessionID: 'cli-session',
    cwd: ctx.repo,
    startedAt,
    command: 'git worktree add .worktrees/x -b feat/x',
    resultText: '',
  };

  const push = buildMockModRequest({
    sessionID: 'other-session',
    cwd: ctx.repo,
    toolName: 'Bash',
    toolInput: { command: 'git push origin feat/x' },
  });

  await runCLI(['record'], {
    stdin: () => Promise.resolve(JSON.stringify(record)),
    stdout: buildStubOutput(),
    stderr: buildStubOutput(),
    host: ctx.host,
    signal: ctx.signal,
  });

  const exitCode = await runCLI(['run', '--local-only'], {
    stdin: () => Promise.resolve(JSON.stringify(push)),
    stdout: ctx.stdout,
    stderr: ctx.stderr,
    host: ctx.host,
    signal: ctx.signal,
  });

  expect({ exitCode, stdout: ctx.stdout.read(), stderr: ctx.stderr.read() }).toStrictEqual({
    exitCode: 0,
    stdout: JSON.stringify({
      decision: 'deny',
      reason: `[Outside Task Scope] This action writes outside the task scope: branch feat/x. The task owns the worktree ${ctx.repo}. Do the work inside the task's own worktree and branch, or ask the user to extend the task scope to this target. Do not retry this action, and do not reach the same result another way: not with a different command, tool, script, file, or agent. Continue the task on a safer path that does not need this action. If no safer path exists for this step, finish the rest of the task first, then tell the user what you need from them for this step. Denials left before auto-mode asks the user: 2.`,
    }),
    stderr: '',
  });
});

test('it allows an action that Jev clears', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.dir, 'auto-mode'));

  await writeFile(
    join(ctx.dir, 'auto-mode', 'config.json'),
    JSON.stringify({
      classifiers: { jev: { baseURL: 'https://decision.test' } },
      decision: { classifier: 'jev', onFailure: 'defer' },
    }),
  );

  const payload = buildMockModRequest({
    cwd: ctx.repo,
    toolName: 'Bash',
    toolInput: { command: 'make deploy' },
  });

  const exitCode = await runCLI(['run'], {
    stdin: () => Promise.resolve(JSON.stringify(payload)),
    stdout: ctx.stdout,
    stderr: ctx.stderr,
    host: { ...ctx.host, env: { ...ctx.host.env, TYPESAFE_API_KEY: 'cli-test-key' } },
    signal: ctx.signal,
  });

  const log = await readFile(join(ctx.dir, 'actions.jsonl'), 'utf8');

  const last = log.trim().split('\n').at(-1);

  invariant(last !== undefined, 'the run wrote a diagnostic record');

  expect({ exitCode, stdout: ctx.stdout.read(), stderr: ctx.stderr.read() }).toStrictEqual({
    exitCode: 0,
    stdout: '{"decision":"allow"}',
    stderr: '',
  });

  expect(JSON.parse(last)).toStrictEqual({
    schemaVersion: 3,
    time: expect.toBeDateString(),
    invocationID: expect.toBeString(),
    sessionHash: expect.toBeString(),
    actionHash: expect.toBeString(),
    status: 'allow',
    verdict: 'allow',
    decidingStage: 'jev',
    denials: { consecutive: 0, session: 0 },
    escalation: false,
    diagnostics: {
      status: 'allow',
      stage: 'response',
      keyResolved: true,
      keySource: 'environment',
      failureReason: null,
      requestBytes: expect.toBeNumber(),
      elapsedMs: expect.toBeNumber(),
      minConfidence: 0.8,
      contributors: [],
    },
  });
});

test('it denies an action that Jev cannot clear, naming the rule and its reason', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.dir, 'auto-mode'));

  await writeFile(
    join(ctx.dir, 'auto-mode', 'config.json'),
    JSON.stringify({
      classifiers: { jev: { baseURL: 'https://decision.test' } },
      decision: { classifier: 'jev', onFailure: 'defer' },
    }),
  );

  decisionAnswers.set('rule_0', {
    type: 'choice',
    choice: 'ask',
    confidence: 1,
    probabilities: { allow: 0, block: 0, ask: 1 },
  });

  const payload = buildMockModRequest({
    cwd: ctx.repo,
    toolName: 'Bash',
    toolInput: { command: 'make deploy' },
  });

  const exitCode = await runCLI(['run'], {
    stdin: () => Promise.resolve(JSON.stringify(payload)),
    stdout: ctx.stdout,
    stderr: ctx.stderr,
    host: { ...ctx.host, env: { ...ctx.host.env, TYPESAFE_API_KEY: 'cli-test-key' } },
    signal: ctx.signal,
  });

  expect({ exitCode, stdout: ctx.stdout.read(), stderr: ctx.stderr.read() }).toStrictEqual({
    exitCode: 0,
    stdout: JSON.stringify({
      decision: 'deny',
      reason:
        '[Data Exfiltration] The supplied evidence cannot rule out sending sensitive data, such as credentials or private code, off the machine. No instruction or configuration clears this rule. Do not retry this action, and do not reach the same result another way: not with a different command, tool, script, file, or agent. Continue the task on a safer path that does not need this action. If no safer path exists for this step, finish the rest of the task first, then tell the user what you need from them for this step. Denials left before auto-mode asks the user: 2.',
    }),
    stderr: '',
  });
});

test('it writes no verdict and notes the failure when Jev fails under a defer setting', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.dir, 'auto-mode'));

  await writeFile(
    join(ctx.dir, 'auto-mode', 'config.json'),
    JSON.stringify({
      classifiers: { jev: { baseURL: 'https://decision.test' } },
      decision: { classifier: 'jev', onFailure: 'defer' },
    }),
  );

  server.use(http.post(DECISION_URL, () => HttpResponse.text('boom', { status: 500 })));

  const payload = buildMockModRequest({
    cwd: ctx.repo,
    toolName: 'Bash',
    toolInput: { command: 'make deploy' },
  });

  const exitCode = await runCLI(['run'], {
    stdin: () => Promise.resolve(JSON.stringify(payload)),
    stdout: ctx.stdout,
    stderr: ctx.stderr,
    host: { ...ctx.host, env: { ...ctx.host.env, TYPESAFE_API_KEY: 'cli-test-key' } },
    signal: ctx.signal,
  });

  expect({ exitCode, stdout: ctx.stdout.read(), stderr: ctx.stderr.read() }).toStrictEqual({
    exitCode: 0,
    stdout: '',
    stderr: 'auto-mode: jev-1.13.0 unavailable: Decision API returned HTTP 500\n',
  });
});

test('it denies the action when Jev fails under a deny setting', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.dir, 'auto-mode'));

  await writeFile(
    join(ctx.dir, 'auto-mode', 'config.json'),
    JSON.stringify({
      classifiers: { jev: { baseURL: 'https://decision.test' } },
      decision: { classifier: 'jev', onFailure: 'deny' },
    }),
  );

  server.use(http.post(DECISION_URL, () => HttpResponse.text('boom', { status: 500 })));

  const payload = buildMockModRequest({
    cwd: ctx.repo,
    toolName: 'Bash',
    toolInput: { command: 'make deploy' },
  });

  const exitCode = await runCLI(['run'], {
    stdin: () => Promise.resolve(JSON.stringify(payload)),
    stdout: ctx.stdout,
    stderr: ctx.stderr,
    host: { ...ctx.host, env: { ...ctx.host.env, TYPESAFE_API_KEY: 'cli-test-key' } },
    signal: ctx.signal,
  });

  expect({ exitCode, stdout: ctx.stdout.read(), stderr: ctx.stderr.read() }).toStrictEqual({
    exitCode: 0,
    stdout: JSON.stringify({
      decision: 'deny',
      reason:
        '[Classifier Unavailable] jev-1.13.0 unavailable: Decision API returned HTTP 500. Do not retry this action, and do not reach the same result another way: not with a different command, tool, script, file, or agent. Continue the task on a safer path that does not need this action. If no safer path exists for this step, finish the rest of the task first, then tell the user what you need from them for this step. Denials left before auto-mode asks the user: 2.',
    }),
    stderr: 'auto-mode: jev-1.13.0 unavailable: Decision API returned HTTP 500\n',
  });
});
