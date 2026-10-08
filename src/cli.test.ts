import { expect, onTestFinished, test } from 'bun:test';
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import invariant from 'tiny-invariant';

const CLI = join(import.meta.dirname, 'cli.ts');

// XDG_CONFIG_HOME points at an empty directory so the run never reads the
// operator's own config, and every run that could reach a model passes
// --local-only or fails before the request.
async function setupTest(): Promise<{ readonly dir: string; readonly env: NodeJS.ProcessEnv }> {
  const dir = await mkdtemp(join(tmpdir(), 'auto-mode-cli-'));

  onTestFinished(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  return {
    dir,
    env: {
      ...process.env,
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
  await writeFile(join(ctx.dir, 'auto-mode', 'config.json'), JSON.stringify({ preset: 'spark' }));

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
    JSON.stringify({ preset: 'jev', onFailure: 'deny' }),
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
      '[Classifier Unavailable] Claude settings unreadable. Do not retry this action, and do not reach the same result another way: not with a different command, tool, script, file, or agent. Continue the task on a safer path that does not need this action. If no safer path exists for this step, finish the rest of the task first, then tell the user what you need from them for this step.',
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
    JSON.stringify({ preset: 'jev', onFailure: 'deny' }),
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
    reason: '[Classifier Unavailable] Claude settings unreadable.',
  });
});

test('it migrates the config file in place with config migrate', async () => {
  const ctx = await setupTest();

  const configFile = join(ctx.dir, 'auto-mode', 'config.json');

  await mkdir(join(ctx.dir, 'auto-mode'));
  await writeFile(configFile, JSON.stringify({ preset: 'jev', claudeSettingsPath: null }));

  const result = await Bun.$`bun ${CLI} config migrate`.env(ctx.env).quiet().nothrow();

  expect(result.exitCode).toBe(0);
  expect(result.stdout.toString()).toInclude(`rewrote ${configFile}`);

  const rewritten = await readFile(configFile, 'utf8');

  expect(JSON.parse(rewritten)).toStrictEqual({
    classifiers: { jev: {} },
    decision: { classifier: 'jev' },
    policy: { claudeSettingsPath: null },
  });
});

test('it warns on stderr when the config file uses the old keys', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.dir, 'auto-mode'));
  await writeFile(join(ctx.dir, 'auto-mode', 'config.json'), JSON.stringify({ preset: 'jev' }));

  const fixture = join(import.meta.dirname, '..', 'fixtures', 'mod-request-regenerable.json');

  const result = await Bun.$`bun ${CLI} run --local-only < ${fixture}`
    .env(ctx.env)
    .quiet()
    .nothrow();

  expect(JSON.parse(result.stdout.toString())).toStrictEqual({ decision: 'allow' });
  expect(result.stderr.toString()).toInclude('run `auto-mode config migrate`');
});
