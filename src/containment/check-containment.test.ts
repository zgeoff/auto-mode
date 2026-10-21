import { expect, test } from 'bun:test';
import { buildMockActionRequest } from '../../test-utils/factories/build-mock-action-request.ts';
import { buildMockOwnedScope } from '../../test-utils/factories/build-mock-owned-scope.ts';
import { checkContainment } from './check-containment.ts';

test('it finds no deny for a write inside the owned worktree', () => {
  const request = buildMockActionRequest({
    toolName: 'Bash',
    cwd: '/home/dev/app',
    toolInput: { command: 'rm -rf build' },
  });

  const deny = checkContainment(
    request,
    buildMockOwnedScope({ home: '/home/dev', worktrees: ['/home/dev/app'] }),
  );

  expect(deny).toBeNull();
});

test('it denies a write outside the one owned worktree and names both', () => {
  const request = buildMockActionRequest({
    toolName: 'Write',
    cwd: '/home/dev/app',
    toolInput: { file_path: '/home/dev/notes/todo.md', content: 'x' },
  });

  const deny = checkContainment(
    request,
    buildMockOwnedScope({ home: '/home/dev', worktrees: ['/home/dev/app'], branches: [] }),
  );

  expect(deny).toStrictEqual({
    rule: 'Outside Task Scope',
    reason:
      "This action writes outside the task scope: path /home/dev/notes/todo.md. The task owns the worktree /home/dev/app. Do the work inside the task's own worktree and branch, or ask the user to extend the task scope to this target.",
    findings: [{ kind: 'path', target: '/home/dev/notes/todo.md', grant: { kind: 'path' } }],
  });
});

test('it names one owned branch beside the owned worktree', () => {
  const request = buildMockActionRequest({
    toolName: 'Bash',
    cwd: '/home/dev/app',
    toolInput: { command: 'rm -rf /home/dev/other' },
  });

  const deny = checkContainment(
    request,
    buildMockOwnedScope({ home: '/home/dev', worktrees: ['/home/dev/app'], branches: ['feat/a'] }),
  );

  expect(deny).toStrictEqual({
    rule: 'Outside Task Scope',
    reason:
      "This action writes outside the task scope: path /home/dev/other. The task owns the worktree /home/dev/app and the branch feat/a. Do the work inside the task's own worktree and branch, or ask the user to extend the task scope to this target.",
    findings: [{ kind: 'path', target: '/home/dev/other', grant: { kind: 'path' } }],
  });
});

test('it names several owned worktrees and branches in the plural', () => {
  const request = buildMockActionRequest({
    toolName: 'Bash',
    cwd: '/home/dev/app',
    toolInput: { command: 'rm -rf /home/dev/other' },
  });

  const deny = checkContainment(
    request,
    buildMockOwnedScope({
      home: '/home/dev',
      worktrees: ['/home/dev/app', '/home/dev/app-docs'],
      branches: ['feat/a', 'feat/b'],
    }),
  );

  expect(deny).toStrictEqual({
    rule: 'Outside Task Scope',
    reason:
      "This action writes outside the task scope: path /home/dev/other. The task owns the worktrees /home/dev/app, /home/dev/app-docs and the branches feat/a, feat/b. Do the work inside the task's own worktree and branch, or ask the user to extend the task scope to this target.",
    findings: [{ kind: 'path', target: '/home/dev/other', grant: { kind: 'path' } }],
  });
});

test('it labels each kind of target by what it reaches', () => {
  const request = buildMockActionRequest({
    toolName: 'Bash',
    cwd: '/home/dev/app',
    toolInput: {
      command:
        'git branch -D other; gh pr comment 40 -b x; op item edit deploy password=x; docker volume prune -af',
    },
  });

  const deny = checkContainment(
    request,
    buildMockOwnedScope({
      home: '/home/dev',
      worktrees: ['/home/dev/app'],
      branches: ['feat/a'],
      currentBranch: 'feat/a',
    }),
  );

  expect(deny).toStrictEqual({
    rule: 'Outside Task Scope',
    reason:
      "This action writes outside the task scope: branch other, remote target gh pr comment, credential or global setting op item edit, shared resource docker volume prune -af. The task owns the worktree /home/dev/app and the branch feat/a. Do the work inside the task's own worktree and branch, or ask the user to extend the task scope to this target.",
    findings: [
      { kind: 'branch', target: 'other', grant: { kind: 'branch' } },
      {
        kind: 'remote-write',
        target: 'gh pr comment',
        grant: { kind: 'pull-request', number: 40 },
      },
      { kind: 'credential', target: 'op item edit' },
      { kind: 'prune', target: 'docker volume prune -af' },
    ],
  });
});

test('it names the first five targets and counts the rest', () => {
  const request = buildMockActionRequest({
    toolName: 'Bash',
    cwd: '/home/dev/app',
    toolInput: { command: 'rm -rf /srv/a /srv/b /srv/c /srv/d /srv/e /srv/f /srv/g' },
  });

  const deny = checkContainment(
    request,
    buildMockOwnedScope({ home: '/home/dev', worktrees: ['/home/dev/app'], branches: [] }),
  );

  expect(deny).toStrictEqual({
    rule: 'Outside Task Scope',
    reason:
      "This action writes outside the task scope: path /srv/a, path /srv/b, path /srv/c, path /srv/d, path /srv/e and 2 more. The task owns the worktree /home/dev/app. Do the work inside the task's own worktree and branch, or ask the user to extend the task scope to this target.",
    findings: [
      { kind: 'path', target: '/srv/a', grant: { kind: 'path' } },
      { kind: 'path', target: '/srv/b', grant: { kind: 'path' } },
      { kind: 'path', target: '/srv/c', grant: { kind: 'path' } },
      { kind: 'path', target: '/srv/d', grant: { kind: 'path' } },
      { kind: 'path', target: '/srv/e', grant: { kind: 'path' } },
      { kind: 'path', target: '/srv/f', grant: { kind: 'path' } },
      { kind: 'path', target: '/srv/g', grant: { kind: 'path' } },
    ],
  });
});

test('it finds no deny for a write under /tmp when the caller leaves the scratch paths to the default', () => {
  const request = buildMockActionRequest({
    toolName: 'Bash',
    cwd: '/home/dev/app',
    toolInput: { command: 'rm -rf /tmp/build' },
  });

  const deny = checkContainment(
    request,
    buildMockOwnedScope({ home: '/home/dev', worktrees: ['/home/dev/app'] }),
  );

  expect(deny).toBeNull();
});

test('it finds no deny for a write under a scratch path the caller supplies', () => {
  const request = buildMockActionRequest({
    toolName: 'Bash',
    cwd: '/home/dev/app',
    toolInput: { command: 'rm -rf /scratch/build' },
  });

  const deny = checkContainment(
    request,
    buildMockOwnedScope({ home: '/home/dev', worktrees: ['/home/dev/app'] }),
    ['/scratch'],
  );

  expect(deny).toBeNull();
});

test('it denies a write under /tmp when the caller supplies an empty scratch list', () => {
  const request = buildMockActionRequest({
    toolName: 'Bash',
    cwd: '/home/dev/app',
    toolInput: { command: 'rm -rf /tmp/build' },
  });

  const deny = checkContainment(
    request,
    buildMockOwnedScope({ home: '/home/dev', worktrees: ['/home/dev/app'], branches: [] }),
    [],
  );

  expect(deny).toStrictEqual({
    rule: 'Outside Task Scope',
    reason:
      "This action writes outside the task scope: path /tmp/build. The task owns the worktree /home/dev/app. Do the work inside the task's own worktree and branch, or ask the user to extend the task scope to this target.",
    findings: [{ kind: 'path', target: '/tmp/build', grant: { kind: 'path' } }],
  });
});

test('it denies a hard reset onto the remote branch and says how to keep the work', () => {
  const request = buildMockActionRequest({
    toolName: 'Bash',
    cwd: '/home/dev/app',
    toolInput: { command: 'git fetch origin && git reset --hard origin/feat/a' },
  });

  const deny = checkContainment(
    request,
    buildMockOwnedScope({
      home: '/home/dev',
      worktrees: ['/home/dev/app'],
      branches: ['feat/a'],
      currentBranch: 'feat/a',
    }),
  );

  expect(deny).toStrictEqual({
    rule: 'Outside Task Scope',
    reason:
      'This action writes outside the task scope: discarded work git reset --hard origin/feat/a. The task owns the worktree /home/dev/app and the branch feat/a. A hard reset onto another commit, or a branch deletion that names no branch, discards commits and changes the task may not have made. Sync a branch with git merge --ff-only or git rebase, and delete branches by name, or ask the user to run this action.',
    findings: [{ kind: 'discard', target: 'git reset --hard origin/feat/a' }],
  });
});

test('it gives both pieces of advice when a discard comes with a write outside the scope', () => {
  const request = buildMockActionRequest({
    toolName: 'Bash',
    cwd: '/home/dev/app',
    toolInput: { command: 'git branch | grep -v main | xargs git branch -D; rm -rf /srv/a' },
  });

  const deny = checkContainment(
    request,
    buildMockOwnedScope({ home: '/home/dev', worktrees: ['/home/dev/app'], branches: [] }),
  );

  expect(deny).toStrictEqual({
    rule: 'Outside Task Scope',
    reason:
      "This action writes outside the task scope: discarded work git branch delete by exclusion, path /srv/a. The task owns the worktree /home/dev/app. A hard reset onto another commit, or a branch deletion that names no branch, discards commits and changes the task may not have made. Sync a branch with git merge --ff-only or git rebase, and delete branches by name, or ask the user to run this action. Do the work inside the task's own worktree and branch, or ask the user to extend the task scope to this target.",
    findings: [
      { kind: 'discard', target: 'git branch delete by exclusion' },
      { kind: 'path', target: '/srv/a', grant: { kind: 'path' } },
    ],
  });
});

test.each([
  'LEFTHOOK=0 git push',
  'HUSKY=0 git commit -m x',
  'git commit --no-verify -m x',
  'git push --no-verify',
  'git commit -n -m x',
  'LEFTHOOK_EXCLUDE=test git push',
  'LEFTHOOK_SKIP=lint git commit -m x',
  'LEFTHOOK_EXCLUDE=test gh stack push',
  'LEFTHOOK_EXCLUDE=test gh stack sync',
  'LEFTHOOK_EXCLUDE=test gh stack submit',
])('it passes the in-scope hook bypass %s on with no deny', (command) => {
  const request = buildMockActionRequest({
    toolName: 'Bash',
    cwd: '/home/dev/app',
    toolInput: { command },
  });

  const deny = checkContainment(
    request,
    buildMockOwnedScope({
      home: '/home/dev',
      worktrees: ['/home/dev/app'],
      branches: ['feat/a'],
      currentBranch: 'feat/a',
    }),
  );

  expect(deny).toBeNull();
});
