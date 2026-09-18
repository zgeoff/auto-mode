import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import invariant from 'tiny-invariant';

const CLI = join(import.meta.dirname, 'cli.ts');

// XDG_CONFIG_HOME points at an empty directory so the run never reads the
// operator's own config, and every run passes --local-only so it never reaches
// a gateway.
async function setupTest(): Promise<{ readonly env: NodeJS.ProcessEnv }> {
  const dir = await mkdtemp(join(tmpdir(), 'auto-mode-cli-'));

  onTestFinished(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  return { env: { ...process.env, XDG_CONFIG_HOME: dir } };
}

test('it prints usage and exits 0 when given no command', async () => {
  const ctx = await setupTest();
  const result = await Bun.$`bun ${CLI}`.env(ctx.env).quiet().nothrow();

  expect(result.exitCode).toBe(0);
  expect(result.stdout.toString()).toInclude('auto-mode run');
});

test('it exits 2 on a command it does not know', async () => {
  const ctx = await setupTest();
  const result = await Bun.$`bun ${CLI} frobnicate`.env(ctx.env).quiet().nothrow();

  expect(result.exitCode).toBe(2);
  expect(result.stderr.toString()).toInclude("unknown command 'frobnicate'");
});

test('it exits 2 when init names no harness', async () => {
  const ctx = await setupTest();
  const result = await Bun.$`bun ${CLI} init`.env(ctx.env).quiet().nothrow();

  expect(result.exitCode).toBe(2);
  expect(result.stderr.toString()).toInclude('claude, codex or muse');
});

const HARNESSES: string[] = ['claude', 'codex', 'muse'];

test.each(HARNESSES)('it prints a pasteable hook entry for %s', async (harness) => {
  const ctx = await setupTest();
  const result = await Bun.$`bun ${CLI} init ${harness}`.env(ctx.env).quiet().nothrow();

  const entry: unknown = JSON.parse(
    result.stdout
      .toString()
      .split('\n')
      .filter((line) => !line.startsWith('#'))
      .join('\n'),
  );

  expect(result.exitCode).toBe(0);
  expect(entry).toMatchObject({ hooks: { PreToolUse: expect.toBeArray() } });
});

// Claude Code reports a permission request of its own, and the hook answers
// only the calls that reach it; the other two harnesses never send the event.
test('it prints a permission-request entry for Claude when asked for one', async () => {
  const ctx = await setupTest();

  const result = await Bun.$`bun ${CLI} init claude --event permission-request`
    .env(ctx.env)
    .quiet()
    .nothrow();

  const entry: unknown = JSON.parse(
    result.stdout
      .toString()
      .split('\n')
      .filter((line) => !line.startsWith('#'))
      .join('\n'),
  );

  expect(result.exitCode).toBe(0);
  expect(entry).toMatchObject({ hooks: { PermissionRequest: expect.toBeArray() } });
});

test('it exits 2 when asked for an event no harness sends', async () => {
  const ctx = await setupTest();

  const result = await Bun.$`bun ${CLI} init claude --event on-tuesday`
    .env(ctx.env)
    .quiet()
    .nothrow();

  expect(result.exitCode).toBe(2);
  expect(result.stderr.toString()).toInclude('pre-tool-use or permission-request');
});

test('it exits 2 when a harness that sends no permission request is asked for one', async () => {
  const ctx = await setupTest();

  const result = await Bun.$`bun ${CLI} init muse --event permission-request`
    .env(ctx.env)
    .quiet()
    .nothrow();

  expect(result.exitCode).toBe(2);
  expect(result.stderr.toString()).toInclude('only Claude Code');
});

test('it prints the assembled prompt with no marker left behind', async () => {
  const ctx = await setupTest();
  const result = await Bun.$`bun ${CLI} print-prompt`.env(ctx.env).quiet().nothrow();

  const prompt = result.stdout.toString();

  expect(result.exitCode).toBe(0);
  expect(prompt).not.toInclude('<rules>');
  expect(prompt).toInclude('## HARD BLOCK rules');
});

// The hook always exits 0. A non-zero exit reads as a broken hook, and the JSON
// on stdout is what decides the outcome.
const UNJUDGEABLE: [string, string][] = [
  ['stdin that is not JSON', 'not json at all'],
  ['a body that is not an object', '"a string"'],
  ['a payload from no known harness', '{"hook_event_name":"PreToolUse","tool_name":"Read"}'],
  ['an event that is not a tool gate', '{"prompt_id":"p","hook_event_name":"Stop"}'],
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

test('it allows a read-only command from a real Muse payload', async () => {
  const ctx = await setupTest();

  const fixture = join(import.meta.dirname, '..', 'fixtures', 'muse-pre-tool-use.json');

  const result = await Bun.$`bun ${CLI} run --local-only < ${fixture}`
    .env(ctx.env)
    .quiet()
    .nothrow();

  const verdict: unknown = JSON.parse(result.stdout.toString());

  expect(result.exitCode).toBe(0);

  expect(verdict).toStrictEqual({
    hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'allow' },
  });
});

// Claude Code recorded this payload on a real permission request. The event
// takes a nested decision, and the flat one the tool gate takes is dropped: an
// allow spelled that way leaves the call waiting for the prompt.
test('it allows a read-only command from a real Claude permission request', async () => {
  const ctx = await setupTest();

  const fixture = join(import.meta.dirname, '..', 'fixtures', 'claude-permission-request.json');

  const result = await Bun.$`bun ${CLI} run --local-only < ${fixture}`
    .env(ctx.env)
    .quiet()
    .nothrow();

  const verdict: unknown = JSON.parse(result.stdout.toString());

  expect(result.exitCode).toBe(0);

  expect(verdict).toStrictEqual({
    hookSpecificOutput: { hookEventName: 'PermissionRequest', decision: { behavior: 'allow' } },
  });
});

const ESCALATING: string[] = ['claude', 'codex'];

test.each(ESCALATING)(
  'it writes nothing for a %s action the local tier will not judge',
  async (harness) => {
    const ctx = await setupTest();

    const fixture = join(import.meta.dirname, '..', 'fixtures', `${harness}-pre-tool-use.json`);

    const result = await Bun.$`bun ${CLI} run --local-only < ${fixture}`
      .env(ctx.env)
      .quiet()
      .nothrow();

    expect(result.exitCode).toBe(0);
    expect(result.stdout.toString()).toBe('');
  },
);

test('it explains its reasoning on stderr when asked, never on stdout', async () => {
  const ctx = await setupTest();

  const fixture = join(import.meta.dirname, '..', 'fixtures', 'muse-pre-tool-use.json');

  const result = await Bun.$`bun ${CLI} run --local-only --explain < ${fixture}`
    .env(ctx.env)
    .quiet()
    .nothrow();

  expect(result.stderr.toString()).toInclude('allowed by Read-only actions');
  expect(result.stdout.toString()).not.toInclude('auto-mode:');
});

test('it stays silent on stderr when not asked to explain', async () => {
  const ctx = await setupTest();

  const fixture = join(import.meta.dirname, '..', 'fixtures', 'muse-pre-tool-use.json');

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
