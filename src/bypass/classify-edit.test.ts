import { expect, test } from 'bun:test';
import { MAX_SCANNED_BYTES, classifyEdit } from './classify-edit.ts';

const scope = {
  worktrees: ['/repo', '/repo/.worktrees/feat'],
  protectedDirs: ['/home/dev/.config/auto-mode'],
};

test('it bypasses Edit, Write, and NotebookEdit into an in-scope worktree', () => {
  expect(
    [
      {
        toolName: 'Edit',
        toolInput: { file_path: 'x', new_string: 'const a = 1;' },
        requested: '/repo/src/a.ts',
        target: '/repo/src/a.ts',
      },
      {
        toolName: 'Write',
        toolInput: { file_path: 'x', content: '# notes' },
        requested: '/repo/.worktrees/feat/README.md',
        target: '/repo/.worktrees/feat/README.md',
      },
      {
        toolName: 'NotebookEdit',
        toolInput: { notebook_path: 'x', new_source: 'print(1)' },
        requested: '/repo/n.ipynb',
        target: '/repo/n.ipynb',
      },
    ].map((action) => classifyEdit(action, scope)),
  ).toStrictEqual([
    { kind: 'bypass', target: '/repo/src/a.ts' },
    { kind: 'bypass', target: '/repo/.worktrees/feat/README.md' },
    { kind: 'bypass', target: '/repo/n.ipynb' },
  ]);
});

test('it sends a target outside the scope, or in a nested worktree the task does not own, to Jev', () => {
  expect(
    ['/elsewhere/a.ts', '/repo/.worktrees/other/a.ts', '/repository/a.ts'].map(
      (target) =>
        classifyEdit(
          { toolName: 'Write', toolInput: { content: 'x' }, requested: target, target },
          scope,
        ).kind,
    ),
  ).toStrictEqual(['jev', 'jev', 'jev']);
});

test('it sends configuration, hooks, CI, git metadata, and credential files to Jev', () => {
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
    excluded.map(
      (path) =>
        classifyEdit(
          {
            toolName: 'Write',
            toolInput: { content: 'x' },
            requested: `/repo/${path}`,
            target: `/repo/${path}`,
          },
          scope,
        ).kind,
    ),
  ).toStrictEqual(excluded.map(() => 'jev'));
});

test("it sends a write into auto-mode's configuration or state to Jev", () => {
  expect(
    classifyEdit(
      {
        toolName: 'Write',
        toolInput: { content: '{}' },
        requested: '/home/dev/.config/auto-mode/config.json',
        target: '/home/dev/.config/auto-mode/config.json',
      },
      { worktrees: ['/home/dev'], protectedDirs: scope.protectedDirs },
    ),
  ).toStrictEqual({ kind: 'jev', reason: 'target is auto-mode configuration or state' });
});

test('it sends content with a secret to Jev and names the rule', () => {
  const key = ['AKIA', 'Z7QW3RTY5UIOP2LK'].join('');

  expect(
    classifyEdit(
      {
        toolName: 'Edit',
        toolInput: { new_string: `aws_access_key_id = "${key}"` },
        requested: '/repo/src/aws.ts',
        target: '/repo/src/aws.ts',
      },
      scope,
    ),
  ).toStrictEqual({ kind: 'jev', reason: 'secret scan matched aws-access-token' });
});

test('it sends content larger than the scan reads to Jev without scanning part of it', () => {
  expect(
    classifyEdit(
      {
        toolName: 'Write',
        toolInput: { content: 'a'.repeat(MAX_SCANNED_BYTES + 1) },
        requested: '/repo/big.txt',
        target: '/repo/big.txt',
      },
      scope,
    ),
  ).toStrictEqual({ kind: 'jev', reason: 'content larger than the secret scan reads' });
});

test('it sends another tool, or content that is not text, to Jev', () => {
  expect(
    [
      {
        toolName: 'Bash',
        toolInput: { command: 'echo x > a' },
        requested: '/repo/a',
        target: '/repo/a',
      },
      { toolName: 'Write', toolInput: { content: 42 }, requested: '/repo/a', target: '/repo/a' },
    ].map((action) => classifyEdit(action, scope).kind),
  ).toStrictEqual(['jev', 'jev']);
});

test('it sends an edit to Jev when the path as written or the path it resolves to is excluded', () => {
  expect(
    [
      { requested: '/repo/.claude/settings.json', target: '/repo/config/permissions.json' },
      { requested: '/repo/notes.md', target: '/repo/.git/hooks/pre-commit' },
    ].map(
      (paths) =>
        classifyEdit({ toolName: 'Write', toolInput: { content: '{}' }, ...paths }, scope).kind,
    ),
  ).toStrictEqual(['jev', 'jev']);
});

test("it sends a write to a linked worktree's .git file to Jev", () => {
  expect(
    classifyEdit(
      {
        toolName: 'Write',
        toolInput: { content: 'gitdir: /elsewhere/.git/worktrees/x' },
        requested: '/repo/.worktrees/feat/.git',
        target: '/repo/.worktrees/feat/.git',
      },
      scope,
    ),
  ).toStrictEqual({ kind: 'jev', reason: 'target is git metadata' });
});
