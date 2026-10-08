import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildMockAtcSessionRecord } from '../../test-utils/factories/build-mock-atc-session-record.ts';
import { buildMockDecisionRulesCase } from './factories/build-mock-decision-rules-case.ts';
import { buildMockTaskScopeSessions } from './factories/build-mock-task-scope-sessions.ts';
import { runSessionScopeReplay } from './run-session-scope-replay.ts';

async function setupTest(): Promise<{ readonly stateDir: string; readonly atcRecordDir: string }> {
  const dir = await mkdtemp(join(tmpdir(), 'auto-mode-run-session-replay-'));

  onTestFinished(() => rm(dir, { recursive: true, force: true }));

  // The replay reads each session's atc record from here; an absent file is a session without one.
  await mkdir(join(dir, 'atc'));

  return { stateDir: join(dir, 'state'), atcRecordDir: join(dir, 'atc') };
}

test('it checks an action against a worktree that a call made earlier in its session', async () => {
  const ctx = await setupTest();

  const denies = await runSessionScopeReplay({
    recording: buildMockTaskScopeSessions({
      worktreeBranches: { '/home/dev/app-fix': 'fix/a' },
      sessions: [
        {
          name: 'one',
          entries: [
            { case: 'R1' },
            {
              cwd: '/home/dev/app',
              command: 'git worktree add ../app-fix -b fix/a',
              succeeded: true,
              resultText: '',
            },
            { case: 'R2' },
          ],
        },
      ],
    }),
    cases: [
      buildMockDecisionRulesCase({
        id: 'R1',
        tool: 'Bash',
        input: { command: 'rm -rf /home/dev/app-fix/build' },
        cwd: '/home/dev/app',
        repository: { branch: 'feat/a', defaultBranch: 'main' },
      }),
      buildMockDecisionRulesCase({
        id: 'R2',
        tool: 'Bash',
        input: { command: 'rm -rf /home/dev/app-fix/build' },
        cwd: '/home/dev/app',
        repository: { branch: 'feat/a', defaultBranch: 'main' },
      }),
    ],
    stateDir: ctx.stateDir,
    atcRecordDir: ctx.atcRecordDir,
  });

  expect([...denies]).toStrictEqual([
    [
      'R1',
      {
        rule: 'Outside Task Scope',
        reason:
          "This action writes outside the task scope: path /home/dev/app-fix/build. The task owns the worktree /home/dev/app and the branch feat/a. Do the work inside the task's own worktree and branch, or ask the user to extend the task scope to this target.",
        findings: [{ kind: 'path', target: '/home/dev/app-fix/build' }],
      },
    ],
    ['R2', null],
  ]);
});

test('it takes nothing from a call that failed', async () => {
  const ctx = await setupTest();

  const denies = await runSessionScopeReplay({
    recording: buildMockTaskScopeSessions({
      worktreeBranches: { '/home/dev/app-fix': 'fix/a' },
      sessions: [
        {
          name: 'one',
          entries: [
            {
              cwd: '/home/dev/app',
              command: 'git worktree add ../app-fix -b fix/a',
              succeeded: false,
              resultText: 'fatal: invalid reference',
            },
            { case: 'R1' },
          ],
        },
      ],
    }),
    cases: [
      buildMockDecisionRulesCase({
        id: 'R1',
        tool: 'Bash',
        input: { command: 'rm -rf /home/dev/app-fix/build' },
        cwd: '/home/dev/app',
        repository: { branch: 'feat/a', defaultBranch: 'main' },
      }),
    ],
    stateDir: ctx.stateDir,
    atcRecordDir: ctx.atcRecordDir,
  });

  expect([...denies]).toStrictEqual([
    [
      'R1',
      {
        rule: 'Outside Task Scope',
        reason:
          "This action writes outside the task scope: path /home/dev/app-fix/build. The task owns the worktree /home/dev/app and the branch feat/a. Do the work inside the task's own worktree and branch, or ask the user to extend the task scope to this target.",
        findings: [{ kind: 'path', target: '/home/dev/app-fix/build' }],
      },
    ],
  ]);
});

test('it keeps what one session made out of the scope of another session', async () => {
  const ctx = await setupTest();

  const denies = await runSessionScopeReplay({
    recording: buildMockTaskScopeSessions({
      worktreeBranches: { '/home/dev/app-fix': 'fix/a' },
      sessions: [
        {
          name: 'one',
          entries: [
            {
              cwd: '/home/dev/app',
              command: 'git worktree add ../app-fix -b fix/a',
              succeeded: true,
              resultText: '',
            },
          ],
        },
        { name: 'two', entries: [{ case: 'R1' }] },
      ],
    }),
    cases: [
      buildMockDecisionRulesCase({
        id: 'R1',
        tool: 'Bash',
        input: { command: 'rm -rf /home/dev/app-fix/build' },
        cwd: '/home/dev/app',
        repository: { branch: 'feat/a', defaultBranch: 'main' },
      }),
    ],
    stateDir: ctx.stateDir,
    atcRecordDir: ctx.atcRecordDir,
  });

  expect([...denies]).toStrictEqual([
    [
      'R1',
      {
        rule: 'Outside Task Scope',
        reason:
          "This action writes outside the task scope: path /home/dev/app-fix/build. The task owns the worktree /home/dev/app and the branch feat/a. Do the work inside the task's own worktree and branch, or ask the user to extend the task scope to this target.",
        findings: [{ kind: 'path', target: '/home/dev/app-fix/build' }],
      },
    ],
  ]);
});

test('it adds the worktrees of the atc session record of the session', async () => {
  const ctx = await setupTest();

  await writeFile(
    join(ctx.atcRecordDir, 'one.json'),
    JSON.stringify(
      buildMockAtcSessionRecord({
        session: 'one',
        scope: {
          workspace: { path: '/home/dev/app', branch: 'feat/a' },
          worktrees: [{ path: '/home/dev/app-fix', branch: 'fix/a' }],
        },
      }),
    ),
  );

  const denies = await runSessionScopeReplay({
    recording: buildMockTaskScopeSessions({
      sessions: [{ name: 'one', entries: [{ case: 'R1' }] }],
    }),
    cases: [
      buildMockDecisionRulesCase({
        id: 'R1',
        tool: 'Bash',
        input: { command: 'rm -rf /home/dev/app-fix/build' },
        cwd: '/home/dev/app',
        repository: { branch: 'feat/a', defaultBranch: 'main' },
      }),
    ],
    stateDir: ctx.stateDir,
    atcRecordDir: ctx.atcRecordDir,
  });

  expect(denies.get('R1')).toBeNull();
});

test('it adds the branches of the atc session record in the action repository', async () => {
  const ctx = await setupTest();

  await writeFile(
    join(ctx.atcRecordDir, 'one.json'),
    JSON.stringify(
      buildMockAtcSessionRecord({
        session: 'one',
        scope: {
          workspace: { path: '/home/dev/app', branch: 'feat/a' },
          branches: [{ name: 'fix/b', repo: '/home/dev/app' }],
        },
      }),
    ),
  );

  const denies = await runSessionScopeReplay({
    recording: buildMockTaskScopeSessions({
      sessions: [{ name: 'one', entries: [{ case: 'R1' }] }],
    }),
    cases: [
      buildMockDecisionRulesCase({
        id: 'R1',
        tool: 'Bash',
        input: { command: 'git branch -D fix/b' },
        cwd: '/home/dev/app',
        repository: { branch: 'feat/a', defaultBranch: 'main' },
      }),
    ],
    stateDir: ctx.stateDir,
    atcRecordDir: ctx.atcRecordDir,
  });

  expect(denies.get('R1')).toBeNull();
});

test('it checks an action against a PR that a call opened earlier in its session', async () => {
  const ctx = await setupTest();

  const denies = await runSessionScopeReplay({
    recording: buildMockTaskScopeSessions({
      remotes: [{ name: 'origin', url: 'git@github.com:dev/app.git' }],
      pullRequestHeads: { '5': 'feat/a' },
      sessions: [
        {
          name: 'one',
          entries: [
            { case: 'R1' },
            {
              cwd: '/home/dev/app',
              command: 'gh pr create --fill',
              succeeded: true,
              resultText: 'https://github.com/dev/app/pull/5\n',
            },
            { case: 'R2' },
          ],
        },
      ],
    }),
    cases: [
      buildMockDecisionRulesCase({
        id: 'R1',
        tool: 'Bash',
        input: { command: 'gh pr comment 5 -b done' },
        cwd: '/home/dev/app',
        repository: { branch: 'feat/a', defaultBranch: 'main' },
      }),
      buildMockDecisionRulesCase({
        id: 'R2',
        tool: 'Bash',
        input: { command: 'gh pr comment 5 -b done' },
        cwd: '/home/dev/app',
        repository: { branch: 'feat/a', defaultBranch: 'main' },
      }),
    ],
    stateDir: ctx.stateDir,
    atcRecordDir: ctx.atcRecordDir,
  });

  expect([...denies]).toStrictEqual([
    [
      'R1',
      {
        rule: 'Outside Task Scope',
        reason:
          "This action writes outside the task scope: remote target gh pr comment. The task owns the worktree /home/dev/app and the branch feat/a. Do the work inside the task's own worktree and branch, or ask the user to extend the task scope to this target.",
        findings: [{ kind: 'remote-write', target: 'gh pr comment' }],
      },
    ],
    ['R2', null],
  ]);
});

test('it checks an action against a branch that a call made earlier in its session', async () => {
  const ctx = await setupTest();

  const denies = await runSessionScopeReplay({
    recording: buildMockTaskScopeSessions({
      sessions: [
        {
          name: 'one',
          entries: [
            { case: 'R1' },
            {
              cwd: '/home/dev/app',
              command: 'git branch fix/b',
              succeeded: true,
              resultText: '',
            },
            { case: 'R2' },
          ],
        },
      ],
    }),
    cases: [
      buildMockDecisionRulesCase({
        id: 'R1',
        tool: 'Bash',
        input: { command: 'git branch -D fix/b' },
        cwd: '/home/dev/app',
        repository: { branch: 'feat/a', defaultBranch: 'main' },
      }),
      buildMockDecisionRulesCase({
        id: 'R2',
        tool: 'Bash',
        input: { command: 'git branch -D fix/b' },
        cwd: '/home/dev/app',
        repository: { branch: 'feat/a', defaultBranch: 'main' },
      }),
    ],
    stateDir: ctx.stateDir,
    atcRecordDir: ctx.atcRecordDir,
  });

  expect([...denies]).toStrictEqual([
    [
      'R1',
      {
        rule: 'Outside Task Scope',
        reason:
          "This action writes outside the task scope: branch fix/b. The task owns the worktree /home/dev/app and the branch feat/a. Do the work inside the task's own worktree and branch, or ask the user to extend the task scope to this target.",
        findings: [{ kind: 'branch', target: 'fix/b' }],
      },
    ],
    ['R2', null],
  ]);
});

test('it places every checkout of an atc session record in the action repository', async () => {
  const ctx = await setupTest();

  await writeFile(
    join(ctx.atcRecordDir, 'one.json'),
    JSON.stringify(
      buildMockAtcSessionRecord({
        session: 'one',
        scope: {
          workspace: { path: '/home/dev/app', branch: 'feat/a' },
          branches: [{ name: 'fix/b', repo: '/home/dev/other' }],
        },
      }),
    ),
  );

  const denies = await runSessionScopeReplay({
    recording: buildMockTaskScopeSessions({
      sessions: [{ name: 'one', entries: [{ case: 'R1' }] }],
    }),
    cases: [
      buildMockDecisionRulesCase({
        id: 'R1',
        tool: 'Bash',
        input: { command: 'git branch -D fix/b' },
        cwd: '/home/dev/app',
        repository: { branch: 'feat/a', defaultBranch: 'main' },
      }),
    ],
    stateDir: ctx.stateDir,
    atcRecordDir: ctx.atcRecordDir,
  });

  expect(denies.get('R1')).toBeNull();
});

test('it rejects a recording that names a case the corpus lacks', async () => {
  const ctx = await setupTest();

  expect(
    runSessionScopeReplay({
      recording: buildMockTaskScopeSessions({
        sessions: [{ name: 'one', entries: [{ case: 'R9' }] }],
      }),
      cases: [],
      stateDir: ctx.stateDir,
      atcRecordDir: ctx.atcRecordDir,
    }),
  ).rejects.toThrowWithMessage(Error, /the corpus lacks: R9/u);
});
