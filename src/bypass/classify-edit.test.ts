import { expect, test } from 'bun:test';
import { buildMockEditAction } from '../../test-utils/factories/build-mock-edit-action.ts';
import { classifyEdit } from './classify-edit.ts';

test('it bypasses an Edit into an in-scope worktree', () => {
  const action = buildMockEditAction({
    toolName: 'Edit',
    toolInput: { old_string: 'a = 1', new_string: 'a = 2' },
    target: '/repo/src/a.ts',
    requested: '/repo/src/a.ts',
    checkout: '/repo',
    current: 'export const a = 1;\n',
  });

  expect(classifyEdit(action, { worktrees: ['/repo'], protectedDirs: [] })).toStrictEqual({
    kind: 'bypass',
    target: '/repo/src/a.ts',
  });
});

test('it bypasses a Write into an in-scope worktree nested in another', () => {
  const action = buildMockEditAction({
    toolName: 'Write',
    toolInput: { content: '# notes' },
    target: '/repo/.worktrees/feat/README.md',
    checkout: null,
  });

  expect(
    classifyEdit(action, { worktrees: ['/repo', '/repo/.worktrees/feat'], protectedDirs: [] }),
  ).toStrictEqual({ kind: 'bypass', target: '/repo/.worktrees/feat/README.md' });
});

test('it bypasses a write to the parent worktree while a nested worktree is also in scope', () => {
  const action = buildMockEditAction({
    toolName: 'Write',
    toolInput: { content: 'export const a = 1;\n' },
    target: '/repo/src/a.ts',
    checkout: '/repo',
  });

  expect(
    classifyEdit(action, { worktrees: ['/repo', '/repo/.worktrees/feat'], protectedDirs: [] }),
  ).toStrictEqual({ kind: 'bypass', target: '/repo/src/a.ts' });
});

test('it bypasses an in-scope write while an unrelated directory is protected', () => {
  const action = buildMockEditAction({
    toolName: 'Write',
    toolInput: { content: 'export const a = 1;\n' },
    target: '/repo/src/a.ts',
    checkout: null,
  });

  expect(
    classifyEdit(action, { worktrees: ['/repo'], protectedDirs: ['/home/dev/.config/auto-mode'] }),
  ).toStrictEqual({ kind: 'bypass', target: '/repo/src/a.ts' });
});

test('it bypasses a NotebookEdit into an in-scope worktree', () => {
  const action = buildMockEditAction({
    toolName: 'NotebookEdit',
    toolInput: { new_source: 'print(1)' },
    target: '/repo/n.ipynb',
    checkout: '/repo',
  });

  expect(classifyEdit(action, { worktrees: ['/repo'], protectedDirs: [] })).toStrictEqual({
    kind: 'bypass',
    target: '/repo/n.ipynb',
  });
});

test.each([
  ['/elsewhere/a.ts', 'target outside every in-scope worktree'],
  ['/repository/a.ts', 'target outside every in-scope worktree'],
  ['/repo/.worktrees/other/a.ts', 'target in a nested worktree outside the scope'],
])('it sends a write to %s to Jev as a %s', (target, reason) => {
  const action = buildMockEditAction({ toolName: 'Write', target });

  expect(
    classifyEdit(action, { worktrees: ['/repo', '/repo/.worktrees/feat'], protectedDirs: [] }),
  ).toStrictEqual({ kind: 'jev', reason });
});

test('it sends a target in another checkout nested inside an in-scope worktree to Jev', () => {
  const action = buildMockEditAction({
    toolName: 'Write',
    target: '/repo/vendor/lib/a.ts',
    checkout: '/repo/vendor/lib',
  });

  expect(classifyEdit(action, { worktrees: ['/repo'], protectedDirs: [] })).toStrictEqual({
    kind: 'jev',
    reason: 'target in a checkout outside the scope',
  });
});

test.each([
  ['.claude/settings.json', 'agent configuration'],
  ['packages/web/.claude/commands/x.md', 'agent configuration'],
  ['.codex/config.toml', 'agent configuration'],
  ['.muse/agent.md', 'agent configuration'],
  ['AGENTS.md', 'agent configuration'],
  ['docs/CLAUDE.md', 'agent configuration'],
  ['CLAUDE.local.md', 'agent configuration'],
  ['.vscode/settings.json', 'a settings file'],
  ['lefthook.yml', 'a hook file'],
  ['.husky/pre-commit', 'a hook file'],
  ['.pre-commit-config.yaml', 'a hook file'],
  ['mods/x/hooks/hooks.json', 'a hook file'],
  ['.git/config', 'git metadata'],
  ['.github/workflows/ci.yml', 'a CI workflow'],
  ['.gitlab-ci.yml', 'a CI workflow'],
  ['.env', 'an env file'],
  ['.env.production', 'an env file'],
  ['.envrc', 'an env file'],
  ['.npmrc', 'a credential file'],
  ['config/credentials.json', 'a credential file'],
  ['deploy/server.pem', 'a credential file'],
  ['keys/id_ed25519', 'a credential file'],
  ['infra/prod.tfvars', 'a credential file'],
])('it sends a write to %s to Jev as %s', (path, exclusion) => {
  const action = buildMockEditAction({
    toolName: 'Write',
    target: `/repo/${path}`,
    checkout: null,
  });

  expect(classifyEdit(action, { worktrees: ['/repo'], protectedDirs: [] })).toStrictEqual({
    kind: 'jev',
    reason: `target is ${exclusion}`,
  });
});

test.each([
  ['/repo/.claude/settings.json', '/repo/config/permissions.json', 'agent configuration'],
  ['/repo/notes.md', '/repo/.git/hooks/pre-commit', 'git metadata'],
])('it sends an edit of %s that resolves to %s to Jev as %s', (requested, target, exclusion) => {
  const action = buildMockEditAction({ toolName: 'Write', requested, target, checkout: null });

  expect(classifyEdit(action, { worktrees: ['/repo'], protectedDirs: [] })).toStrictEqual({
    kind: 'jev',
    reason: `target is ${exclusion}`,
  });
});

test("it sends a write to a linked worktree's .git file to Jev", () => {
  const action = buildMockEditAction({
    toolName: 'Write',
    target: '/repo/.worktrees/feat/.git',
    checkout: null,
  });

  expect(
    classifyEdit(action, { worktrees: ['/repo', '/repo/.worktrees/feat'], protectedDirs: [] }),
  ).toStrictEqual({ kind: 'jev', reason: 'target is git metadata' });
});

test("it sends a write into auto-mode's configuration or state to Jev", () => {
  const action = buildMockEditAction({
    toolName: 'Write',
    target: '/home/dev/.config/auto-mode/config.json',
    checkout: null,
  });

  expect(
    classifyEdit(action, {
      worktrees: ['/home/dev'],
      protectedDirs: ['/home/dev/.config/auto-mode'],
    }),
  ).toStrictEqual({ kind: 'jev', reason: 'target is auto-mode configuration or state' });
});

test('it sends content with a secret to Jev and names the rule', () => {
  const key = ['AKIA', 'Z7QW3RTY5UIOP2LK'].join('');

  const action = buildMockEditAction({
    toolName: 'Write',
    toolInput: { content: `aws_access_key_id = "${key}"` },
    target: '/repo/src/aws.ts',
    checkout: null,
  });

  expect(classifyEdit(action, { worktrees: ['/repo'], protectedDirs: [] })).toStrictEqual({
    kind: 'jev',
    reason: 'secret scan matched aws-access-token',
  });
});

test('it scans an Edit with the lines around it, so a bare value in a key assignment matches', () => {
  const value = ['d4F7n9K2m5', 'P8q1R6s3T0u7V4w9X2y5Z8'].join('');

  const action = buildMockEditAction({
    toolName: 'Edit',
    toolInput: { old_string: 'PLACEHOLDER', new_string: value },
    target: '/repo/src/config.ts',
    checkout: '/repo',
    current: 'const client = connect({\n  api_key = "PLACEHOLDER"\n});\n',
  });

  expect(classifyEdit(action, { worktrees: ['/repo'], protectedDirs: [] })).toStrictEqual({
    kind: 'jev',
    reason: 'secret scan matched generic-api-key',
  });
});

test('it sends an Edit whose text is not in the file to Jev', () => {
  const action = buildMockEditAction({
    toolName: 'Edit',
    toolInput: { old_string: 'missing', new_string: 'b' },
    target: '/repo/a.ts',
    checkout: '/repo',
    current: 'const a = 1;\n',
  });

  expect(classifyEdit(action, { worktrees: ['/repo'], protectedDirs: [] })).toStrictEqual({
    kind: 'jev',
    reason: 'the edit text is not in the file',
  });
});

test('it sends an Edit of a file with no current content to Jev', () => {
  const action = buildMockEditAction({
    toolName: 'Edit',
    toolInput: { old_string: 'missing', new_string: 'b' },
    target: '/repo/a.ts',
    checkout: '/repo',
    current: null,
  });

  expect(classifyEdit(action, { worktrees: ['/repo'], protectedDirs: [] })).toStrictEqual({
    kind: 'jev',
    reason: 'the edit cannot be read in the context of its file',
  });
});

test('it scans content of exactly the size the scan reads', () => {
  const action = buildMockEditAction({
    toolName: 'Write',
    toolInput: { content: 'a'.repeat(256 * 1024) },
    target: '/repo/big.txt',
    checkout: null,
  });

  expect(classifyEdit(action, { worktrees: ['/repo'], protectedDirs: [] })).toStrictEqual({
    kind: 'bypass',
    target: '/repo/big.txt',
  });
});

test('it sends content one byte larger than the scan reads to Jev without scanning part of it', () => {
  const action = buildMockEditAction({
    toolName: 'Write',
    toolInput: { content: 'a'.repeat(256 * 1024 + 1) },
    target: '/repo/big.txt',
    checkout: null,
  });

  expect(classifyEdit(action, { worktrees: ['/repo'], protectedDirs: [] })).toStrictEqual({
    kind: 'jev',
    reason: 'content larger than the secret scan reads',
  });
});

test('it sends a tool that is not a file edit to Jev', () => {
  const action = buildMockEditAction({
    toolName: 'Bash',
    target: '/repo/a',
  });

  expect(classifyEdit(action, { worktrees: ['/repo'], protectedDirs: [] })).toStrictEqual({
    kind: 'jev',
    reason: 'not a file-tool edit',
  });
});

test('it sends content that is not text to Jev', () => {
  const action = buildMockEditAction({
    toolName: 'Write',
    toolInput: { content: 42 },
    target: '/repo/a',
    checkout: null,
  });

  expect(classifyEdit(action, { worktrees: ['/repo'], protectedDirs: [] })).toStrictEqual({
    kind: 'jev',
    reason: 'edit content is not text',
  });
});

test('it bypasses a write below a worktree whose own path holds an excluded name', () => {
  const action = buildMockEditAction({
    toolName: 'Write',
    toolInput: { content: 'export const a = 1;\n' },
    target: '/home/dev/.docker/app/src/a.ts',
    checkout: null,
  });

  expect(
    classifyEdit(action, { worktrees: ['/home/dev/.docker/app'], protectedDirs: [] }),
  ).toStrictEqual({ kind: 'bypass', target: '/home/dev/.docker/app/src/a.ts' });
});

test('it sends a write requested outside every worktree through an excluded name to Jev', () => {
  const action = buildMockEditAction({
    toolName: 'Write',
    requested: '/home/dev/.claude/a.md',
    target: '/home/dev/.docker/app/src/a.ts',
    checkout: null,
  });

  expect(
    classifyEdit(action, { worktrees: ['/home/dev/.docker/app'], protectedDirs: [] }),
  ).toStrictEqual({ kind: 'jev', reason: 'target is agent configuration' });
});
