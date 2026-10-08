import { expect, onTestFinished, test } from 'bun:test';
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import invariant from 'tiny-invariant';
import * as z from 'zod';
import { runGit } from '../test-utils/run-git.ts';

const CLI = join(import.meta.dirname, 'cli.ts');

// The child gets PATH to find bun and everything else from the temp root, never the host's
// environment. No run reaches a model: each passes --local-only, fails before the request, or uses
// the denying setup, whose unreadable Claude settings deny every escalated action under onFailure deny.
async function setupTest(
  options: { readonly denying?: boolean; readonly denialBudget?: Readonly<object> } = {},
): Promise<{ readonly dir: string; readonly env: NodeJS.ProcessEnv }> {
  const dir = await mkdtemp(join(tmpdir(), 'auto-mode-cli-'));

  onTestFinished(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  if (options.denying === true) {
    await mkdir(join(dir, 'auto-mode'));
    await writeFile(join(dir, 'settings.json'), 'not json {');

    await writeFile(
      join(dir, 'auto-mode', 'config.json'),
      JSON.stringify({
        decision: {
          onFailure: 'deny',
          ...(options.denialBudget === undefined ? {} : { denialBudget: options.denialBudget }),
        },
      }),
    );
  }

  return {
    dir,
    env: {
      PATH: process.env['PATH'],
      HOME: dir,
      XDG_CONFIG_HOME: dir,
      XDG_STATE_HOME: dir,
      AUTO_MODE_DIAGNOSTICS_PATH: join(dir, 'actions.jsonl'),
      CLAUDE_CONFIG_DIR: dir,
      TYPESAFE_API_KEY: 'cli-test-key',
      META_API_KEY: 'cli-test-meta-key',
      ANTHROPIC_API_KEY: 'cli-test-claude-key',
      ZAI_API_KEY: 'cli-test-zai-key',
    },
  };
}

function buildRequest(toolName: string, toolInput: Readonly<Record<string, unknown>>): string {
  return JSON.stringify({
    sessionID: 'cli-session',
    toolUseID: 'cli-action',
    cwd: '/repo',
    toolName,
    toolInput,
    context: {
      agentID: null,
      originalUserTask: null,
      delegatedTask: null,
      lastDirectUserMessage: null,
      omittedTaskContext: [{ field: 'originalUserTask', reason: 'unavailable' }],
    },
  });
}

test('it prints usage and exits 0 when given no command', async () => {
  const ctx = await setupTest();
  const result = await Bun.$`bun ${CLI}`.env(ctx.env).quiet().nothrow();

  expect(result.exitCode).toBe(0);
  expect(result.stdout.toString()).toInclude('auto-mode run');
});

test('it refuses a traditional evaluator in Jev-only mode before a local allowance', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.dir, 'auto-mode'));

  await writeFile(
    join(ctx.dir, 'auto-mode', 'config.json'),
    JSON.stringify({ decision: { classifier: 'spark' } }),
  );

  const payload = buildRequest('Read', { file_path: '/repo/file.ts' });

  const result = await Bun.$`bun ${CLI} run --jev-only < ${new Response(payload)}`
    .env(ctx.env)
    .quiet()
    .nothrow();

  expect(result.exitCode).toBe(0);
  expect(result.stdout.toString()).toBe('');
  expect(result.stderr.toString()).toInclude('Jev-only evaluation requires system-one');
});

test('it accepts a local allowance through Jev-only mode', async () => {
  const ctx = await setupTest();

  const payload = buildRequest('Read', { file_path: '/repo/file.ts' });

  const result = await Bun.$`bun ${CLI} run --jev-only < ${new Response(payload)}`
    .env(ctx.env)
    .quiet()
    .nothrow();

  expect(result.exitCode).toBe(0);

  const output: unknown = JSON.parse(result.stdout.toString());

  expect(output).toStrictEqual({ decision: 'allow' });
});

test('it exits 2 on a command it does not know', async () => {
  const ctx = await setupTest();
  const result = await Bun.$`bun ${CLI} frobnicate`.env(ctx.env).quiet().nothrow();

  expect(result.exitCode).toBe(2);
  expect(result.stderr.toString()).toInclude("unknown command 'frobnicate'");
});

test('it prints the assembled prompt with no marker left behind', async () => {
  const ctx = await setupTest();
  const result = await Bun.$`bun ${CLI} print-prompt`.env(ctx.env).quiet().nothrow();

  const prompt = result.stdout.toString();

  expect(result.exitCode).toBe(0);
  expect(prompt).not.toInclude('<rules>');
  expect(prompt).toInclude('## HARD BLOCK rules');
});

// The CLI always exits 0. The mod reads a non-zero exit as a failure, and the
// JSON on stdout is what decides the outcome.
const UNJUDGEABLE: [string, string][] = [
  ['stdin that is not JSON', 'not json at all'],
  ['a body that is not an object', '"a string"'],
  [
    'a Claude Code hook payload',
    '{"prompt_id":"p","hook_event_name":"PermissionRequest","tool_name":"Read","tool_input":{}}',
  ],
];

test.each(UNJUDGEABLE)('it writes nothing and exits 0 on %s', async (_label, stdin) => {
  const ctx = await setupTest();

  const result = await Bun.$`bun ${CLI} run --local-only < ${new Response(stdin)}`
    .env(ctx.env)
    .quiet()
    .nothrow();

  expect(result.exitCode).toBe(0);
  expect(result.stdout.toString()).toBe('');
});

// Recorded from the mod in a live Claude Code session: Claude Code prompted for
// the deletion, and the local tier allows regenerable build output.
test('it allows a recorded mod request for regenerable output', async () => {
  const ctx = await setupTest();

  const fixture = join(import.meta.dirname, '..', 'fixtures', 'mod-request-regenerable.json');

  const result = await Bun.$`bun ${CLI} run --local-only < ${fixture}`
    .env(ctx.env)
    .quiet()
    .nothrow();

  const verdict: unknown = JSON.parse(result.stdout.toString());

  expect(result.exitCode).toBe(0);
  expect(verdict).toStrictEqual({ decision: 'allow' });
});

test('it writes nothing for a recorded mod request the local tier will not judge', async () => {
  const ctx = await setupTest();

  const fixture = join(import.meta.dirname, '..', 'fixtures', 'mod-request-write.json');

  const result = await Bun.$`bun ${CLI} run --local-only < ${fixture}`
    .env(ctx.env)
    .quiet()
    .nothrow();

  expect(result.exitCode).toBe(0);
  expect(result.stdout.toString()).toBe('');
});

test('it explains its reasoning on stderr when asked, never on stdout', async () => {
  const ctx = await setupTest();

  const fixture = join(import.meta.dirname, '..', 'fixtures', 'mod-request-regenerable.json');

  const result = await Bun.$`bun ${CLI} run --local-only --explain < ${fixture}`
    .env(ctx.env)
    .quiet()
    .nothrow();

  expect(result.stderr.toString()).toInclude('allowed by Regenerable output');
  expect(result.stdout.toString()).not.toInclude('auto-mode:');
});

test('it stays silent on stderr when not asked to explain', async () => {
  const ctx = await setupTest();

  const fixture = join(import.meta.dirname, '..', 'fixtures', 'mod-request-regenerable.json');

  const result = await Bun.$`bun ${CLI} run --local-only < ${fixture}`
    .env(ctx.env)
    .quiet()
    .nothrow();

  expect(result.stderr.toString()).toBe('');
});

test('it reads an overridden policy instead of the shipped one', async () => {
  const ctx = await setupTest();
  const dir = await mkdtemp(join(tmpdir(), 'auto-mode-policy-'));

  onTestFinished(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  const classifierPath = join(dir, 'classifier.md');
  const rulesPath = join(dir, 'rules.md');

  await Bun.write(classifierPath, 'framework\n\n<rules>\n');
  await Bun.write(rulesPath, 'the rules');

  const result =
    await Bun.$`bun ${CLI} print-prompt --classifier ${classifierPath} --rules ${rulesPath}`
      .env(ctx.env)
      .quiet()
      .nothrow();

  invariant(result.exitCode === 0, 'print-prompt succeeds with an overridden policy');

  expect(result.stdout.toString().trim()).toBe('framework\n\nthe rules');
});

test('it escalates local allowances when imported deny rules need evaluation', async () => {
  const ctx = await setupTest();

  await writeFile(
    join(ctx.dir, 'settings.json'),
    JSON.stringify({ autoMode: { hard_deny: ['Never read the private key'] } }),
  );

  const payload = buildRequest('Read', { file_path: '/repo/key.pem' });

  const result = await Bun.$`bun ${CLI} run --local-only < ${new Response(payload)}`
    .env(ctx.env)
    .quiet()
    .nothrow();

  expect(result.exitCode).toBe(0);
  expect(result.stdout.toString()).toBe('');
});

test('it honors fail-closed settings when Claude rules are malformed without printing their contents', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.dir, 'auto-mode'));

  await writeFile(
    join(ctx.dir, 'auto-mode', 'config.json'),
    JSON.stringify({ decision: { onFailure: 'deny' } }),
  );

  await writeFile(join(ctx.dir, 'settings.json'), 'private-test-value {');

  const payload = buildRequest('Read', { file_path: '/repo/file.ts' });

  const result = await Bun.$`bun ${CLI} run < ${new Response(payload)}`
    .env(ctx.env)
    .quiet()
    .nothrow();

  const verdict: unknown = JSON.parse(result.stdout.toString());

  expect(result.exitCode).toBe(0);

  expect(verdict).toStrictEqual({
    decision: 'deny',
    reason:
      '[Classifier Unavailable] Claude settings unreadable. Do not retry this action, and do not reach the same result another way: not with a different command, tool, script, file, or agent. Continue the task on a safer path that does not need this action. If no safer path exists for this step, finish the rest of the task first, then tell the user what you need from them for this step. Denials left before auto-mode asks the user: 2.',
  });

  expect(result.stderr.toString()).not.toInclude('private-test-value');
});

test('it exits successfully on malformed classifier configuration without echoing it', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.dir, 'auto-mode'));
  await writeFile(join(ctx.dir, 'auto-mode', 'config.json'), 'private-test-value {');

  const payload = buildRequest('Read', { file_path: '/repo/file.ts' });

  const result = await Bun.$`bun ${CLI} run < ${new Response(payload)}`
    .env(ctx.env)
    .quiet()
    .nothrow();

  expect(result.exitCode).toBe(0);
  expect(result.stdout.toString()).toBe('');
  expect(result.stderr.toString()).not.toInclude('private-test-value');

  const diagnosticsText = await readFile(join(ctx.dir, 'actions.jsonl'), 'utf8');

  const records: unknown[] = diagnosticsText
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line) as unknown);

  expect(records).toMatchObject([{ status: 'started' }, { status: 'failure', verdict: 'defer' }]);
});

test('it keeps a fail-closed denial when the safer-path guidance is missing', async () => {
  const ctx = await setupTest();

  const root = join(import.meta.dirname, '..');
  const copy = join(ctx.dir, 'package');

  await cp(join(root, 'src'), join(copy, 'src'), { recursive: true });

  for (const file of ['classifier.md', 'decision.md', 'rules.md']) {
    await cp(join(root, 'policy', file), join(copy, 'policy', file));
  }

  await symlink(join(root, 'node_modules'), join(copy, 'node_modules'));
  await mkdir(join(ctx.dir, 'auto-mode'));

  await writeFile(
    join(ctx.dir, 'auto-mode', 'config.json'),
    JSON.stringify({ decision: { onFailure: 'deny' } }),
  );

  await writeFile(join(ctx.dir, 'settings.json'), 'not json {');

  const payload = buildRequest('Read', { file_path: '/repo/file.ts' });

  const result = await Bun.$`bun ${join(copy, 'src', 'cli.ts')} run < ${new Response(payload)}`
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
  const ctx = await setupTest({ denying: true });

  const outputs: string[] = [];

  for (const command of ['git push a', 'git push b', 'git push c', 'git push d', 'git push e']) {
    const payload = buildRequest('Bash', { command });

    const result = await Bun.$`bun ${CLI} run < ${new Response(payload)}`
      .env(ctx.env)
      .quiet()
      .nothrow();

    outputs.push(result.stdout.toString());
  }

  const budgetTexts = outputs.map(
    (output) => /user: \d\.|This is the last denial|^$/u.exec(output)?.[0] ?? output,
  );

  expect(budgetTexts).toStrictEqual([
    'user: 2.',
    'user: 1.',
    'This is the last denial',
    '',
    'user: 2.',
  ]);

  const log = await readFile(join(ctx.dir, 'actions.jsonl'), 'utf8');

  const recordSchema = z.object({
    status: z.string(),
    decidingStage: z.string().nullable(),
    denials: z.object({ consecutive: z.number(), session: z.number() }).nullable(),
    escalation: z.boolean(),
  });

  const finals = log
    .trim()
    .split('\n')
    .map((line) => recordSchema.parse(JSON.parse(line)))
    .filter((record) => record.status !== 'started')
    .map((record) => [record.decidingStage, record.denials, record.escalation]);

  expect(finals).toStrictEqual([
    ['jev', { consecutive: 1, session: 1 }, false],
    ['jev', { consecutive: 2, session: 2 }, false],
    ['jev', { consecutive: 3, session: 3 }, false],
    ['budget', { consecutive: 0, session: 0 }, true],
    ['jev', { consecutive: 1, session: 1 }, false],
  ]);
});

test('it denies a retry of the action just denied without asking the classifier', async () => {
  const ctx = await setupTest({ denying: true });

  const payload = buildRequest('Bash', { command: 'git push origin main' });

  await Bun.$`bun ${CLI} run < ${new Response(payload)}`.env(ctx.env).quiet().nothrow();

  // Readable settings now would let the classifier tier run; the retry must not reach it.
  await writeFile(join(ctx.dir, 'settings.json'), '{}');

  const retry = await Bun.$`bun ${CLI} run < ${new Response(payload)}`
    .env(ctx.env)
    .quiet()
    .nothrow();

  const verdict = z.object({ reason: z.string() }).parse(JSON.parse(retry.stdout.toString()));

  expect(verdict.reason).toStartWith('[Classifier Unavailable] Claude settings unreadable.');
  expect(verdict.reason).toEndWith('Denials left before auto-mode asks the user: 1.');

  const log = await readFile(join(ctx.dir, 'actions.jsonl'), 'utf8');

  expect(log.trim().split('\n').at(-1)).toInclude('"decidingStage":"retry"');
});

test('it keeps the count across processes for a resumed session and apart for a subagent', async () => {
  const ctx = await setupTest({ denying: true, denialBudget: { consecutive: 1 } });

  const main = buildRequest('Bash', { command: 'git push a' });
  const resumed = buildRequest('Bash', { command: 'git push b' });

  const child = JSON.stringify({
    sessionID: 'cli-session',
    cwd: '/repo',
    toolName: 'Bash',
    toolInput: { command: 'git push c' },
    context: {
      agentID: 'subagent',
      originalUserTask: null,
      delegatedTask: null,
      lastDirectUserMessage: null,
      omittedTaskContext: [],
    },
  });

  const first = await Bun.$`bun ${CLI} run < ${new Response(main)}`.env(ctx.env).quiet().nothrow();

  const fromChild = await Bun.$`bun ${CLI} run < ${new Response(child)}`
    .env(ctx.env)
    .quiet()
    .nothrow();

  const second = await Bun.$`bun ${CLI} run < ${new Response(resumed)}`
    .env(ctx.env)
    .quiet()
    .nothrow();

  expect(first.stdout.toString()).toInclude('This is the last denial');
  expect(fromChild.stdout.toString()).toInclude('This is the last denial');
  expect(second.stdout.toString()).toBe('');
});

test('it keeps a branch the session created in its scope across processes, for that session only', async () => {
  const ctx = await setupTest();

  const repo = join(ctx.dir, 'repo');

  runGit(ctx.dir, ['init', '-q', '-b', 'main', repo]);
  runGit(ctx.dir, ['-C', repo, 'remote', 'add', 'origin', 'git@github.com:dev/app.git']);
  runGit(ctx.dir, ['-C', repo, 'commit', '-q', '--allow-empty', '-m', 'init']);

  const startedAt = Date.now();

  runGit(ctx.dir, ['-C', repo, 'worktree', 'add', '-q', '.worktrees/x', '-b', 'feat/x']);

  const record = JSON.stringify({
    sessionID: 'cli-session',
    cwd: repo,
    startedAt,
    command: 'git worktree add .worktrees/x -b feat/x',
    resultText: '',
  });

  const buildPush = (sessionID: string): string =>
    JSON.stringify({
      sessionID,
      cwd: repo,
      toolName: 'Bash',
      toolInput: { command: 'git push origin feat/x' },
      context: {
        agentID: null,
        originalUserTask: null,
        delegatedTask: null,
        lastDirectUserMessage: null,
        omittedTaskContext: [],
      },
    });

  const recorded = await Bun.$`bun ${CLI} record < ${new Response(record)}`
    .env(ctx.env)
    .quiet()
    .nothrow();

  const own = await Bun.$`bun ${CLI} run --local-only < ${new Response(buildPush('cli-session'))}`
    .env(ctx.env)
    .quiet()
    .nothrow();

  const other =
    await Bun.$`bun ${CLI} run --local-only < ${new Response(buildPush('other-session'))}`
      .env(ctx.env)
      .quiet()
      .nothrow();

  expect([recorded.exitCode, recorded.stdout.toString()]).toStrictEqual([0, '']);
  expect(own.stdout.toString()).toBe('');
  expect(other.stdout.toString()).toInclude('branch feat/x');
});
