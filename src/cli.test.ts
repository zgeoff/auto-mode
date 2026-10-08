import { expect, onTestFinished, test } from 'bun:test';
import { cp, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import invariant from 'tiny-invariant';
import { buildMockModRequest } from '../test-utils/factories/build-mock-mod-request.ts';
import { readFixture } from '../test-utils/read-fixture.ts';
import { runGit } from '../test-utils/run-git.ts';

// The child gets PATH to find bun and every other path from the temp root,
// never the host's environment. It gets no API key, so no run can reach a model.
async function setupTest(): Promise<{
  readonly cli: string;
  readonly dir: string;
  readonly repo: string;
  readonly env: Readonly<Record<string, string | undefined>>;
}> {
  const created = await mkdtemp(join(tmpdir(), 'auto-mode-cli-'));

  onTestFinished(() => rm(created, { recursive: true, force: true }));

  const dir = await realpath(created);

  const repo = join(dir, 'repo');

  // The checkout search walks up from the cwd and would stop at any .git
  // above the temp root, so the repo is a checkout of its own.
  runGit(dir, ['init', '-q', '-b', 'main', repo]);

  return {
    cli: join(import.meta.dirname, 'cli.ts'),
    dir,
    repo,
    env: {
      PATH: process.env['PATH'],
      HOME: dir,
      XDG_CONFIG_HOME: dir,
      XDG_STATE_HOME: dir,
      AUTO_MODE_DIAGNOSTICS_PATH: join(dir, 'actions.jsonl'),
      CLAUDE_CONFIG_DIR: dir,
    },
  };
}

test.each([
  ['no command', []],
  ['--help', ['--help']],
])('it prints usage and exits 0 when given %s', async (_label, args) => {
  const ctx = await setupTest();
  const result = await Bun.$`bun ${ctx.cli} ${args}`.env(ctx.env).quiet().nothrow();

  expect(result.exitCode).toBe(0);

  expect(result.stdout.toString())
    .toBe(`auto-mode — a permission classifier for the auto-mode Claude Code mod

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
`);
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

  const result = await Bun.$`bun ${ctx.cli} run --jev-only < ${Response.json(payload)}`
    .env(ctx.env)
    .quiet()
    .nothrow();

  expect(result.exitCode).toBe(0);
  expect(result.stdout.toString()).toBe('');

  expect(result.stderr.toString()).toBe(
    'auto-mode: Jev-only evaluation requires system-one; no verdict\n',
  );
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

  const result = await Bun.$`bun ${ctx.cli} run --jev-only < ${Response.json(payload)}`
    .env(ctx.env)
    .quiet()
    .nothrow();

  expect(result.exitCode).toBe(0);
  expect(JSON.parse(result.stdout.toString())).toStrictEqual({ decision: 'allow' });
});

test('it allows a local allowance without a model call when a provider key is configured', async () => {
  const ctx = await setupTest();

  const payload = buildMockModRequest({
    cwd: ctx.repo,
    toolName: 'Read',
    toolInput: { file_path: join(ctx.repo, 'file.ts') },
  });

  const result = await Bun.$`bun ${ctx.cli} run --explain < ${Response.json(payload)}`
    .env({ ...ctx.env, TYPESAFE_API_KEY: 'cli-test-key' })
    .quiet()
    .nothrow();

  expect(result.exitCode).toBe(0);
  expect(JSON.parse(result.stdout.toString())).toStrictEqual({ decision: 'allow' });
  expect(result.stderr.toString()).toBe('auto-mode: allowed by Read-only actions (local)\n');
});

test('it refuses an evaluation deadline outside Jev-only mode', async () => {
  const ctx = await setupTest();

  const payload = buildMockModRequest({
    cwd: ctx.repo,
    toolName: 'Read',
    toolInput: { file_path: join(ctx.repo, 'file.ts') },
  });

  const result = await Bun.$`bun ${ctx.cli} run --evaluation-deadline 1 < ${Response.json(payload)}`
    .env(ctx.env)
    .quiet()
    .nothrow();

  expect(result.exitCode).toBe(0);
  expect(result.stdout.toString()).toBe('');
  expect(result.stderr.toString()).toBe('auto-mode: invalid Jev evaluation deadline; no verdict\n');
});

test('it exits 2 on a command it does not know', async () => {
  const ctx = await setupTest();
  const result = await Bun.$`bun ${ctx.cli} frobnicate`.env(ctx.env).quiet().nothrow();

  expect(result.exitCode).toBe(2);

  expect(result.stderr.toString()).toBe(`auto-mode: unknown command 'frobnicate'

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
`);
});

test('it prints the assembled prompt with no marker left behind', async () => {
  const ctx = await setupTest();
  const result = await Bun.$`bun ${ctx.cli} print-prompt`.env(ctx.env).quiet().nothrow();

  expect(result.exitCode).toBe(0);
  expect(result.stdout.toString()).not.toInclude('<rules>');
  expect(result.stdout.toString()).toInclude('## HARD BLOCK rules');
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

  const result = await Bun.$`bun ${ctx.cli} run --local-only < ${new Response(stdin)}`
    .env(ctx.env)
    .quiet()
    .nothrow();

  expect(result.exitCode).toBe(0);
  expect(result.stdout.toString()).toBe('');
});

// Recorded from the mod in a live Claude Code session: Claude Code prompted for
// the deletion, and the local tier allows regenerable build output. The
// recording's cwd moves into the temp root.
test('it allows a recorded mod request for regenerable output', async () => {
  const ctx = await setupTest();

  const payload = { ...readFixture('mod-request-regenerable'), cwd: ctx.repo };

  const result = await Bun.$`bun ${ctx.cli} run --local-only < ${Response.json(payload)}`
    .env(ctx.env)
    .quiet()
    .nothrow();

  expect(result.exitCode).toBe(0);
  expect(JSON.parse(result.stdout.toString())).toStrictEqual({ decision: 'allow' });
});

test('it writes nothing for a recorded mod request the local tier will not judge', async () => {
  const ctx = await setupTest();

  const payload = { ...readFixture('mod-request-write'), cwd: ctx.repo };

  const result = await Bun.$`bun ${ctx.cli} run --local-only < ${Response.json(payload)}`
    .env(ctx.env)
    .quiet()
    .nothrow();

  expect(result.exitCode).toBe(0);
  expect(result.stdout.toString()).toBe('');
});

test('it explains its reasoning on stderr when asked, never on stdout', async () => {
  const ctx = await setupTest();

  const payload = buildMockModRequest({
    cwd: ctx.repo,
    toolName: 'Bash',
    toolInput: { command: 'rm -rf dist' },
  });

  const result = await Bun.$`bun ${ctx.cli} run --local-only --explain < ${Response.json(payload)}`
    .env(ctx.env)
    .quiet()
    .nothrow();

  expect(result.stderr.toString()).toBe('auto-mode: allowed by Regenerable output (local)\n');
  expect(JSON.parse(result.stdout.toString())).toStrictEqual({ decision: 'allow' });
});

test('it stays silent on stderr when not asked to explain', async () => {
  const ctx = await setupTest();

  const payload = buildMockModRequest({
    cwd: ctx.repo,
    toolName: 'Bash',
    toolInput: { command: 'rm -rf dist' },
  });

  const result = await Bun.$`bun ${ctx.cli} run --local-only < ${Response.json(payload)}`
    .env(ctx.env)
    .quiet()
    .nothrow();

  expect(result.stderr.toString()).toBe('');
});

test('it reads an overridden policy instead of the shipped one', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.dir, 'classifier.md'), 'framework\n\n<rules>\n');
  await writeFile(join(ctx.dir, 'rules.md'), 'the rules');

  const result =
    await Bun.$`bun ${ctx.cli} print-prompt --classifier ${join(ctx.dir, 'classifier.md')} --rules ${join(ctx.dir, 'rules.md')}`
      .env(ctx.env)
      .quiet()
      .nothrow();

  expect(result.exitCode).toBe(0);
  expect(result.stdout.toString()).toBe('framework\n\nthe rules\n\n');
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

  const result = await Bun.$`bun ${ctx.cli} run --local-only --explain < ${Response.json(payload)}`
    .env(ctx.env)
    .quiet()
    .nothrow();

  expect(result.exitCode).toBe(0);
  expect(result.stdout.toString()).toBe('');

  expect(result.stderr.toString()).toBe(
    'auto-mode: Read needs the model tier, which this run skipped\n',
  );
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

  const result = await Bun.$`bun ${ctx.cli} run < ${Response.json(payload)}`
    .env(ctx.env)
    .quiet()
    .nothrow();

  expect(result.exitCode).toBe(0);

  expect(JSON.parse(result.stdout.toString())).toStrictEqual({
    decision: 'deny',
    reason:
      '[Classifier Unavailable] Claude settings unreadable. Do not retry this action, and do not reach the same result another way: not with a different command, tool, script, file, or agent. Continue the task on a safer path that does not need this action. If no safer path exists for this step, finish the rest of the task first, then tell the user what you need from them for this step. Denials left before auto-mode asks the user: 2.',
  });

  expect(result.stderr.toString()).toBe(
    'auto-mode: Claude settings unreadable; classifier unavailable\n',
  );
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

  const result = await Bun.$`bun ${ctx.cli} run < ${Response.json(payload)}`
    .env(ctx.env)
    .quiet()
    .nothrow();

  expect(result.exitCode).toBe(0);
  expect(result.stdout.toString()).toBe('');
  expect(result.stderr.toString()).toBe('auto-mode: configuration unreadable; no verdict\n');

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

test('it keeps a fail-closed denial when the safer-path guidance is missing', async () => {
  const ctx = await setupTest();

  const root = join(import.meta.dirname, '..');
  const copy = join(ctx.dir, 'package');

  await cp(join(root, 'src'), join(copy, 'src'), { recursive: true });
  await cp(join(root, 'policy'), join(copy, 'policy'), { recursive: true });
  await rm(join(copy, 'policy', 'denial.md'));
  await symlink(join(root, 'node_modules'), join(copy, 'node_modules'));
  await mkdir(join(ctx.dir, 'auto-mode'));

  await writeFile(
    join(ctx.dir, 'auto-mode', 'config.json'),
    JSON.stringify({
      decision: { onFailure: 'deny', denialBudget: { consecutive: 3, perSession: 20 } },
    }),
  );

  await writeFile(join(ctx.dir, 'settings.json'), 'not json {');

  const payload = buildMockModRequest({
    cwd: ctx.repo,
    toolName: 'Read',
    toolInput: { file_path: join(ctx.repo, 'file.ts') },
  });

  const result = await Bun.$`bun ${join(copy, 'src', 'cli.ts')} run < ${Response.json(payload)}`
    .env(ctx.env)
    .quiet()
    .nothrow();

  expect(result.exitCode).toBe(0);

  expect(JSON.parse(result.stdout.toString())).toStrictEqual({
    decision: 'deny',
    reason:
      '[Classifier Unavailable] Claude settings unreadable. Denials left before auto-mode asks the user: 2.',
  });
});

test('it denies three actions in a row, then leaves the fourth to the user and starts over', async () => {
  const ctx = await setupTest();

  const outputs: string[] = [];

  await mkdir(join(ctx.dir, 'auto-mode'));

  await writeFile(
    join(ctx.dir, 'auto-mode', 'config.json'),
    JSON.stringify({
      decision: { onFailure: 'deny', denialBudget: { consecutive: 3, perSession: 20 } },
    }),
  );

  await writeFile(join(ctx.dir, 'settings.json'), 'not json {');

  for (const command of ['git push a', 'git push b', 'git push c', 'git push d', 'git push e']) {
    const payload = buildMockModRequest({
      sessionID: 'cli-session',
      cwd: ctx.repo,
      toolName: 'Bash',
      toolInput: { command },
      context: { agentID: null },
    });

    const result = await Bun.$`bun ${ctx.cli} run < ${Response.json(payload)}`
      .env(ctx.env)
      .quiet()
      .nothrow();

    outputs.push(result.stdout.toString());
  }

  expect(outputs).toStrictEqual([
    JSON.stringify({
      decision: 'deny',
      reason:
        '[Classifier Unavailable] Claude settings unreadable. Do not retry this action, and do not reach the same result another way: not with a different command, tool, script, file, or agent. Continue the task on a safer path that does not need this action. If no safer path exists for this step, finish the rest of the task first, then tell the user what you need from them for this step. Denials left before auto-mode asks the user: 2.',
    }),
    JSON.stringify({
      decision: 'deny',
      reason:
        '[Classifier Unavailable] Claude settings unreadable. Do not retry this action, and do not reach the same result another way: not with a different command, tool, script, file, or agent. Continue the task on a safer path that does not need this action. If no safer path exists for this step, finish the rest of the task first, then tell the user what you need from them for this step. Denials left before auto-mode asks the user: 1.',
    }),
    JSON.stringify({
      decision: 'deny',
      reason:
        '[Classifier Unavailable] Claude settings unreadable. Do not retry this action, and do not reach the same result another way: not with a different command, tool, script, file, or agent. Continue the task on a safer path that does not need this action. If no safer path exists for this step, finish the rest of the task first, then tell the user what you need from them for this step. This is the last denial before auto-mode asks the user. Stop now, without finishing the rest of the task, and tell the user what consent you need to continue.',
    }),
    '',
    JSON.stringify({
      decision: 'deny',
      reason:
        '[Classifier Unavailable] Claude settings unreadable. Do not retry this action, and do not reach the same result another way: not with a different command, tool, script, file, or agent. Continue the task on a safer path that does not need this action. If no safer path exists for this step, finish the rest of the task first, then tell the user what you need from them for this step. Denials left before auto-mode asks the user: 2.',
    }),
  ]);

  const log = await readFile(join(ctx.dir, 'actions.jsonl'), 'utf8');

  const finals = log
    .trim()
    .split('\n')
    .filter((line) => !line.includes('"status":"started"'))
    .map((line): unknown => JSON.parse(line));

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

  await Bun.$`bun ${ctx.cli} run < ${Response.json(payload)}`.env(ctx.env).quiet().nothrow();

  // Readable settings now would let the classifier tier run; the retry must not reach it.
  await writeFile(join(ctx.dir, 'settings.json'), '{}');

  const retry = await Bun.$`bun ${ctx.cli} run < ${Response.json(payload)}`
    .env(ctx.env)
    .quiet()
    .nothrow();

  expect(JSON.parse(retry.stdout.toString())).toStrictEqual({
    decision: 'deny',
    reason:
      '[Classifier Unavailable] Claude settings unreadable. Do not retry this action, and do not reach the same result another way: not with a different command, tool, script, file, or agent. Continue the task on a safer path that does not need this action. If no safer path exists for this step, finish the rest of the task first, then tell the user what you need from them for this step. Denials left before auto-mode asks the user: 1.',
  });

  const log = await readFile(join(ctx.dir, 'actions.jsonl'), 'utf8');

  const last = log.trim().split('\n').at(-1);

  invariant(last !== undefined, 'the retry wrote a diagnostic record');

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

test('it keeps the denial count across processes for a resumed session', async () => {
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

  const earlier = await Bun.$`bun ${ctx.cli} run < ${Response.json(first)}`
    .env(ctx.env)
    .quiet()
    .nothrow();

  const result = await Bun.$`bun ${ctx.cli} run < ${Response.json(resumed)}`
    .env(ctx.env)
    .quiet()
    .nothrow();

  const log = await readFile(join(ctx.dir, 'actions.jsonl'), 'utf8');

  const last = log.trim().split('\n').at(-1);

  invariant(last !== undefined, 'the resumed run wrote a diagnostic record');

  expect(JSON.parse(earlier.stdout.toString())).toStrictEqual({
    decision: 'deny',
    reason:
      '[Classifier Unavailable] Claude settings unreadable. Do not retry this action, and do not reach the same result another way: not with a different command, tool, script, file, or agent. Continue the task on a safer path that does not need this action. If no safer path exists for this step, finish the rest of the task first, then tell the user what you need from them for this step. This is the last denial before auto-mode asks the user. Stop now, without finishing the rest of the task, and tell the user what consent you need to continue.',
  });

  expect(result.stdout.toString()).toBe('');

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

  await Bun.$`bun ${ctx.cli} run < ${Response.json(main)}`.env(ctx.env).quiet().nothrow();

  const result = await Bun.$`bun ${ctx.cli} run < ${Response.json(child)}`
    .env(ctx.env)
    .quiet()
    .nothrow();

  expect(JSON.parse(result.stdout.toString())).toStrictEqual({
    decision: 'deny',
    reason:
      '[Classifier Unavailable] Claude settings unreadable. Do not retry this action, and do not reach the same result another way: not with a different command, tool, script, file, or agent. Continue the task on a safer path that does not need this action. If no safer path exists for this step, finish the rest of the task first, then tell the user what you need from them for this step. This is the last denial before auto-mode asks the user. Stop now, without finishing the rest of the task, and tell the user what consent you need to continue.',
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

  await Bun.$`bun ${ctx.cli} run < ${Response.json(first)}`.env(ctx.env).quiet().nothrow();
  await Bun.$`bun ${ctx.cli} run < ${Response.json(child)}`.env(ctx.env).quiet().nothrow();

  const result = await Bun.$`bun ${ctx.cli} run < ${Response.json(second)}`
    .env(ctx.env)
    .quiet()
    .nothrow();

  expect(JSON.parse(result.stdout.toString())).toStrictEqual({
    decision: 'deny',
    reason:
      '[Classifier Unavailable] Claude settings unreadable. Do not retry this action, and do not reach the same result another way: not with a different command, tool, script, file, or agent. Continue the task on a safer path that does not need this action. If no safer path exists for this step, finish the rest of the task first, then tell the user what you need from them for this step. This is the last denial before auto-mode asks the user. Stop now, without finishing the rest of the task, and tell the user what consent you need to continue.',
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

  const result = await Bun.$`bun ${ctx.cli} record < ${Response.json(record)}`
    .env(ctx.env)
    .quiet()
    .nothrow();

  expect(result.exitCode).toBe(0);
  expect(result.stdout.toString()).toBe('');
});

test('it ignores a record body that is not JSON', async () => {
  const ctx = await setupTest();

  const result = await Bun.$`bun ${ctx.cli} record < ${new Response('not json at all')}`
    .env(ctx.env)
    .quiet()
    .nothrow();

  expect(result.exitCode).toBe(0);
  expect(result.stdout.toString()).toBe('');
  expect(result.stderr.toString()).toBe('');
});

test('it keeps a branch the session created in its scope across processes', async () => {
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

  await Bun.$`bun ${ctx.cli} record < ${Response.json(record)}`.env(ctx.env).quiet().nothrow();

  const result = await Bun.$`bun ${ctx.cli} run --local-only --explain < ${Response.json(push)}`
    .env(ctx.env)
    .quiet()
    .nothrow();

  expect(result.stdout.toString()).toBe('');

  expect(result.stderr.toString()).toBe(
    'auto-mode: Bash needs the model tier, which this run skipped\n',
  );
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

  await Bun.$`bun ${ctx.cli} record < ${Response.json(record)}`.env(ctx.env).quiet().nothrow();

  const result = await Bun.$`bun ${ctx.cli} run --local-only < ${Response.json(push)}`
    .env(ctx.env)
    .quiet()
    .nothrow();

  expect(JSON.parse(result.stdout.toString())).toStrictEqual({
    decision: 'deny',
    reason: `[Outside Task Scope] This action writes outside the task scope: branch feat/x. The task owns the worktree ${ctx.repo}. Do the work inside the task's own worktree and branch, or ask the user to extend the task scope to this target. Do not retry this action, and do not reach the same result another way: not with a different command, tool, script, file, or agent. Continue the task on a safer path that does not need this action. If no safer path exists for this step, finish the rest of the task first, then tell the user what you need from them for this step. Denials left before auto-mode asks the user: 2.`,
  });
});
