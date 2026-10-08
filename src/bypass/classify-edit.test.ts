import { expect, test } from 'bun:test';
import type { EditAction } from './classify-edit.ts';
import { MAX_SCANNED_BYTES, classifyEdit } from './classify-edit.ts';

function setupTest() {
  const scope = {
    worktrees: ['/repo', '/repo/.worktrees/feat'],
    protectedDirs: ['/home/dev/.config/auto-mode'],
  };

  const unread = { checkout: null, current: null };

  const buildWrite = (target: string, content: unknown = 'x'): EditAction => ({
    ...unread,
    toolName: 'Write',
    toolInput: { file_path: target, content },
    requested: target,
    target,
  });

  return { scope, buildWrite };
}

test('it bypasses Edit, Write, and NotebookEdit into an in-scope worktree', () => {
  const ctx = setupTest();

  const actions: EditAction[] = [
    {
      toolName: 'Edit',
      toolInput: { file_path: 'x', old_string: 'a = 1', new_string: 'a = 2' },
      requested: '/repo/src/a.ts',
      target: '/repo/src/a.ts',
      checkout: '/repo',
      current: 'export const a = 1;\n',
    },
    ctx.buildWrite('/repo/.worktrees/feat/README.md', '# notes'),
    {
      toolName: 'NotebookEdit',
      toolInput: { notebook_path: 'x', new_source: 'print(1)' },
      requested: '/repo/n.ipynb',
      target: '/repo/n.ipynb',
      checkout: '/repo',
      current: null,
    },
  ];

  expect(actions.map((action) => classifyEdit(action, ctx.scope))).toStrictEqual([
    { kind: 'bypass', target: '/repo/src/a.ts' },
    { kind: 'bypass', target: '/repo/.worktrees/feat/README.md' },
    { kind: 'bypass', target: '/repo/n.ipynb' },
  ]);
});

test('it sends a target outside the scope, or in a nested worktree the task does not own, to Jev', () => {
  const ctx = setupTest();

  expect(
    ['/elsewhere/a.ts', '/repo/.worktrees/other/a.ts', '/repository/a.ts'].map(
      (target) => classifyEdit(ctx.buildWrite(target), ctx.scope).kind,
    ),
  ).toStrictEqual(['jev', 'jev', 'jev']);
});

test('it sends a target in another checkout nested inside an in-scope worktree to Jev', () => {
  const ctx = setupTest();

  expect(
    classifyEdit(
      { ...ctx.buildWrite('/repo/vendor/lib/a.ts'), checkout: '/repo/vendor/lib' },
      ctx.scope,
    ),
  ).toStrictEqual({ kind: 'jev', reason: 'target in a checkout outside the scope' });
});

test('it sends configuration, hooks, CI, git metadata, and credential files to Jev', () => {
  const ctx = setupTest();

  const excluded = [
    '.claude/settings.json',
    'packages/web/.claude/commands/x.md',
    '.codex/config.toml',
    '.muse/agent.md',
    'AGENTS.md',
    'docs/CLAUDE.md',
    'CLAUDE.local.md',
    '.vscode/settings.json',
    'lefthook.yml',
    '.husky/pre-commit',
    '.pre-commit-config.yaml',
    'mods/x/hooks/hooks.json',
    '.git/config',
    '.github/workflows/ci.yml',
    '.gitlab-ci.yml',
    '.env',
    '.env.production',
    '.envrc',
    '.npmrc',
    'config/credentials.json',
    'deploy/server.pem',
    'keys/id_ed25519',
    'infra/prod.tfvars',
  ];

  expect(
    excluded.map((path) => classifyEdit(ctx.buildWrite(`/repo/${path}`), ctx.scope).kind),
  ).toStrictEqual(excluded.map(() => 'jev'));
});

test('it sends an edit to Jev when the path as written or the path it resolves to is excluded', () => {
  const ctx = setupTest();

  expect(
    [
      { requested: '/repo/.claude/settings.json', target: '/repo/config/permissions.json' },
      { requested: '/repo/notes.md', target: '/repo/.git/hooks/pre-commit' },
    ].map((paths) => classifyEdit({ ...ctx.buildWrite(paths.target), ...paths }, ctx.scope).kind),
  ).toStrictEqual(['jev', 'jev']);
});

test("it sends a write to a linked worktree's .git file to Jev", () => {
  const ctx = setupTest();

  expect(classifyEdit(ctx.buildWrite('/repo/.worktrees/feat/.git'), ctx.scope)).toStrictEqual({
    kind: 'jev',
    reason: 'target is git metadata',
  });
});

test("it sends a write into auto-mode's configuration or state to Jev", () => {
  const ctx = setupTest();

  expect(
    classifyEdit(ctx.buildWrite('/home/dev/.config/auto-mode/config.json'), {
      worktrees: ['/home/dev'],
      protectedDirs: ctx.scope.protectedDirs,
    }),
  ).toStrictEqual({ kind: 'jev', reason: 'target is auto-mode configuration or state' });
});

test('it sends content with a secret to Jev and names the rule', () => {
  const ctx = setupTest();
  const key = ['AKIA', 'Z7QW3RTY5UIOP2LK'].join('');

  expect(
    classifyEdit(ctx.buildWrite('/repo/src/aws.ts', `aws_access_key_id = "${key}"`), ctx.scope),
  ).toStrictEqual({ kind: 'jev', reason: 'secret scan matched aws-access-token' });
});

test('it scans an Edit with the lines around it, so a bare value in a key assignment matches', () => {
  const ctx = setupTest();
  const value = ['d4F7n9K2m5', 'P8q1R6s3T0u7V4w9X2y5Z8'].join('');

  const edit: EditAction = {
    toolName: 'Edit',
    toolInput: { file_path: 'x', old_string: 'PLACEHOLDER', new_string: value },
    requested: '/repo/src/config.ts',
    target: '/repo/src/config.ts',
    checkout: '/repo',
    current: 'const client = connect({\n  api_key = "PLACEHOLDER"\n});\n',
  };

  expect(classifyEdit(edit, ctx.scope)).toStrictEqual({
    kind: 'jev',
    reason: 'secret scan matched generic-api-key',
  });
});

test('it sends an Edit it cannot place in its file to Jev', () => {
  const ctx = setupTest();

  const edit: EditAction = {
    toolName: 'Edit',
    toolInput: { file_path: 'x', old_string: 'missing', new_string: 'b' },
    requested: '/repo/a.ts',
    target: '/repo/a.ts',
    checkout: '/repo',
    current: 'const a = 1;\n',
  };

  expect(
    [edit, { ...edit, current: null }].map((each) => classifyEdit(each, ctx.scope)),
  ).toStrictEqual([
    { kind: 'jev', reason: 'the edit text is not in the file' },
    { kind: 'jev', reason: 'the edit cannot be read in the context of its file' },
  ]);
});

test('it sends content larger than the scan reads to Jev without scanning part of it', () => {
  const ctx = setupTest();
  const write = ctx.buildWrite('/repo/big.txt', 'a'.repeat(MAX_SCANNED_BYTES + 1));

  expect(classifyEdit(write, ctx.scope)).toStrictEqual({
    kind: 'jev',
    reason: 'content larger than the secret scan reads',
  });
});

test('it sends another tool, or content that is not text, to Jev', () => {
  const ctx = setupTest();
  const shell = { ...ctx.buildWrite('/repo/a'), toolName: 'Bash', toolInput: { command: 'ls' } };
  const actions = [shell, ctx.buildWrite('/repo/a', 42)];

  expect(actions.map((action) => classifyEdit(action, ctx.scope).kind)).toStrictEqual([
    'jev',
    'jev',
  ]);
});

test('it reads exclusions below the worktree, so an excluded name above it does not count', () => {
  const ctx = setupTest();
  const scope = { worktrees: ['/home/dev/.docker/app'], protectedDirs: [] };

  expect(
    [
      ctx.buildWrite('/home/dev/.docker/app/src/a.ts'),
      { ...ctx.buildWrite('/home/dev/.docker/app/src/a.ts'), requested: '/home/dev/.claude/a.md' },
    ].map((action) => classifyEdit(action, scope).kind),
  ).toStrictEqual(['bypass', 'jev']);
});
