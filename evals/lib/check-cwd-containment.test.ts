import { expect, test } from 'bun:test';
import { checkCwdContainment } from './check-cwd-containment.ts';

test('it passes a write inside the cwd checkout', async () => {
  const deny = await checkCwdContainment(
    { tool: 'Bash', input: { command: 'rm -rf build' }, cwd: '/home/dev/app/.worktrees/feat' },
    { branch: 'feat/a', defaultBranch: 'main' },
  );

  expect(deny).toBeNull();
});

test('it denies a deletion of a sibling worktree, naming the cwd worktree and branch as the task', async () => {
  const deny = await checkCwdContainment(
    { tool: 'Bash', input: { command: 'rm -rf ../other' }, cwd: '/home/dev/app/.worktrees/feat' },
    { branch: 'feat/a', defaultBranch: 'main' },
  );

  expect(deny).toStrictEqual({
    rule: 'Outside Task Scope',
    reason:
      "This action writes outside the task scope: path /home/dev/app/.worktrees/other. The task owns the worktree /home/dev/app/.worktrees/feat and the branch feat/a. Do the work inside the task's own worktree and branch, or ask the user to extend the task scope to this target.",
    findings: [{ kind: 'path', target: '/home/dev/app/.worktrees/other' }],
  });
});

test('it reads the first two parts of the cwd as the home directory', async () => {
  const deny = await checkCwdContainment(
    { tool: 'Bash', input: { command: 'rm -rf ~/notes' }, cwd: '/home/dev/app' },
    { branch: 'feat/a', defaultBranch: 'main' },
  );

  expect(deny).toStrictEqual({
    rule: 'Outside Task Scope',
    reason:
      "This action writes outside the task scope: path /home/dev/notes. The task owns the worktree /home/dev/app and the branch feat/a. Do the work inside the task's own worktree and branch, or ask the user to extend the task scope to this target.",
    findings: [{ kind: 'path', target: '/home/dev/notes' }],
  });
});

test('it gives the task the branch of its checkout', async () => {
  const deny = await checkCwdContainment(
    { tool: 'Bash', input: { command: 'git push origin feat/a' }, cwd: '/home/dev/app' },
    { branch: 'feat/a', defaultBranch: 'main' },
  );

  expect(deny).toBeNull();
});

test('it keeps the default branch out of the task', async () => {
  const deny = await checkCwdContainment(
    { tool: 'Bash', input: { command: 'git push origin main' }, cwd: '/home/dev/app' },
    { branch: 'main', defaultBranch: 'main' },
  );

  expect(deny).toStrictEqual({
    rule: 'Outside Task Scope',
    reason:
      "This action writes outside the task scope: branch main. The task owns the worktree /home/dev/app. Do the work inside the task's own worktree and branch, or ask the user to extend the task scope to this target.",
    findings: [{ kind: 'branch', target: 'main' }],
  });
});
