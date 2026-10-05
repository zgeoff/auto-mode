import { expect, test } from 'bun:test';
import { collectScopeFindings } from './collect-scope-findings.ts';

function setupTest() {
  const root = '/home/dev/src/app';
  const worktree = `${root}/.worktrees/feature`;

  const scope = {
    home: '/home/dev',
    repository: 'github.com/dev/app',
    worktrees: [worktree],
    branches: ['feature'],
    pullRequests: [12],
  };

  return { root, worktree, scope };
}

test('it finds nothing for edits, tests, and pushes inside the owned worktree and branch', () => {
  const ctx = setupTest();

  for (const command of [
    'bun test >/tmp/t.log 2>&1; tail -4 /tmp/t.log',
    'git add -A && git commit -m "feat: x" && git push origin feature',
    'git config --global --get-all credential.helper 2>/dev/null',
    "printf 'x' | sed 's/password=.*/password=<present>/'",
    'gh api repos/dev/app/pulls/12/comments/3/replies -f body="ok"',
  ]) {
    expect(
      collectScopeFindings({ tool: 'Bash', cwd: ctx.worktree, input: { command } }, ctx.scope),
    ).toStrictEqual([]);
  }
});

test('it finds a sibling worktree removed by path, by git, or written through a file tool', () => {
  const ctx = setupTest();
  const sibling = `${ctx.root}/.worktrees/other`;

  expect(
    collectScopeFindings(
      { tool: 'Bash', cwd: ctx.worktree, input: { command: 'rm -rf ../other; ls ..' } },
      ctx.scope,
    ),
  ).toStrictEqual([{ kind: 'path', target: sibling }]);

  expect(
    collectScopeFindings(
      {
        tool: 'Bash',
        cwd: ctx.worktree,
        input: { command: 'git worktree remove --force ../other' },
      },
      ctx.scope,
    ),
  ).toStrictEqual([{ kind: 'path', target: sibling }]);

  expect(
    collectScopeFindings(
      { tool: 'Write', cwd: ctx.worktree, input: { file_path: `${sibling}/a.ts`, content: '' } },
      ctx.scope,
    ),
  ).toStrictEqual([{ kind: 'path', target: `${sibling}/a.ts` }]);
});

test('it treats a nested worktree as outside its parent checkout', () => {
  const ctx = setupTest();
  const scope = { ...ctx.scope, worktrees: [ctx.root] };

  expect(
    collectScopeFindings(
      { tool: 'Bash', cwd: ctx.root, input: { command: 'rm -rf .worktrees/other' } },
      scope,
    ),
  ).toStrictEqual([{ kind: 'path', target: `${ctx.root}/.worktrees/other` }]);
});

test('it finds another branch, another pull request, and a merge', () => {
  const ctx = setupTest();

  expect(
    collectScopeFindings(
      {
        tool: 'Bash',
        cwd: ctx.root,
        input: { command: 'git branch -D feature other && git push origin HEAD:main 2>&1' },
      },
      ctx.scope,
    ),
  ).toStrictEqual([
    { kind: 'branch', target: 'other' },
    { kind: 'branch', target: 'main' },
  ]);

  expect(
    collectScopeFindings(
      {
        tool: 'Bash',
        cwd: ctx.worktree,
        input: { command: 'gh pr comment 40 -b x; gh pr merge 12' },
      },
      ctx.scope,
    ),
  ).toStrictEqual([
    { kind: 'remote-write', target: 'gh pr comment' },
    { kind: 'remote-write', target: 'gh pr merge' },
  ]);
});

test('it finds credential changes and volume prunes', () => {
  const ctx = setupTest();

  expect(
    collectScopeFindings(
      {
        tool: 'Bash',
        cwd: ctx.worktree,
        input: {
          command:
            'op item edit deploy password=x; chmod 600 ~/.ssh/id_ed25519; docker volume prune -af',
        },
      },
      ctx.scope,
    ),
  ).toStrictEqual([
    { kind: 'credential', target: 'op item edit' },
    { kind: 'credential', target: '/home/dev/.ssh/id_ed25519' },
    { kind: 'prune', target: 'docker volume prune -af' },
  ]);
});
