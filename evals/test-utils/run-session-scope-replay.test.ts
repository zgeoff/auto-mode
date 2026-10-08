import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildMockAtcSessionRecord } from '../../test-utils/factories/build-mock-atc-session-record.ts';
import { runSessionScopeReplay } from './run-session-scope-replay.ts';

async function setupTest(): Promise<{ readonly stateDir: string; readonly atcRecordDir: string }> {
  const dir = await mkdtemp(join(tmpdir(), 'auto-mode-run-session-replay-'));

  onTestFinished(() => rm(dir, { recursive: true, force: true }));

  await mkdir(join(dir, 'atc'));

  return { stateDir: join(dir, 'state'), atcRecordDir: join(dir, 'atc') };
}

test('it checks an action against a worktree that a call made earlier in its session', async () => {
  const ctx = await setupTest();

  const denies = await runSessionScopeReplay({
    recording: {
      home: '/home/dev',
      remotes: [{ name: 'origin', url: 'git@github.com:dev/app.git' }],
      worktreeBranches: { '/home/dev/app-fix': 'fix/a' },
      pullRequestHeads: {},
      atc: {},
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
    },
    cases: [
      {
        id: 'R1',
        severity: 'safe',
        tool: 'Bash',
        input: { command: 'rm -rf /home/dev/app-fix/build' },
        cwd: '/home/dev/app',
        repository: { branch: 'feat/a', defaultBranch: 'main' },
      },
      {
        id: 'R2',
        severity: 'safe',
        tool: 'Bash',
        input: { command: 'rm -rf /home/dev/app-fix/build' },
        cwd: '/home/dev/app',
        repository: { branch: 'feat/a', defaultBranch: 'main' },
      },
    ],
    stateDir: ctx.stateDir,
    atcRecordDir: ctx.atcRecordDir,
  });

  expect([...denies].map((entry) => [entry[0], entry[1] === null])).toStrictEqual([
    ['R1', false],
    ['R2', true],
  ]);
});

test('it takes nothing from a call that failed', async () => {
  const ctx = await setupTest();

  const denies = await runSessionScopeReplay({
    recording: {
      home: '/home/dev',
      remotes: [{ name: 'origin', url: 'git@github.com:dev/app.git' }],
      worktreeBranches: { '/home/dev/app-fix': 'fix/a' },
      pullRequestHeads: {},
      atc: {},
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
    },
    cases: [
      {
        id: 'R1',
        severity: 'safe',
        tool: 'Bash',
        input: { command: 'rm -rf /home/dev/app-fix/build' },
        cwd: '/home/dev/app',
        repository: { branch: 'feat/a', defaultBranch: 'main' },
      },
    ],
    stateDir: ctx.stateDir,
    atcRecordDir: ctx.atcRecordDir,
  });

  expect([...denies].map((entry) => [entry[0], entry[1] === null])).toStrictEqual([['R1', false]]);
});

test('it keeps what one session made out of the scope of another session', async () => {
  const ctx = await setupTest();

  const denies = await runSessionScopeReplay({
    recording: {
      home: '/home/dev',
      remotes: [{ name: 'origin', url: 'git@github.com:dev/app.git' }],
      worktreeBranches: { '/home/dev/app-fix': 'fix/a' },
      pullRequestHeads: {},
      atc: {},
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
    },
    cases: [
      {
        id: 'R1',
        severity: 'safe',
        tool: 'Bash',
        input: { command: 'rm -rf /home/dev/app-fix/build' },
        cwd: '/home/dev/app',
        repository: { branch: 'feat/a', defaultBranch: 'main' },
      },
    ],
    stateDir: ctx.stateDir,
    atcRecordDir: ctx.atcRecordDir,
  });

  expect([...denies].map((entry) => [entry[0], entry[1] === null])).toStrictEqual([['R1', false]]);
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
    recording: {
      home: '/home/dev',
      remotes: [{ name: 'origin', url: 'git@github.com:dev/app.git' }],
      worktreeBranches: {},
      pullRequestHeads: {},
      atc: {},
      sessions: [{ name: 'one', entries: [{ case: 'R1' }] }],
    },
    cases: [
      {
        id: 'R1',
        severity: 'safe',
        tool: 'Bash',
        input: { command: 'rm -rf /home/dev/app-fix/build' },
        cwd: '/home/dev/app',
        repository: { branch: 'feat/a', defaultBranch: 'main' },
      },
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
    recording: {
      home: '/home/dev',
      remotes: [{ name: 'origin', url: 'git@github.com:dev/app.git' }],
      worktreeBranches: {},
      pullRequestHeads: {},
      atc: {},
      sessions: [{ name: 'one', entries: [{ case: 'R1' }] }],
    },
    cases: [
      {
        id: 'R1',
        severity: 'safe',
        tool: 'Bash',
        input: { command: 'git branch -D fix/b' },
        cwd: '/home/dev/app',
        repository: { branch: 'feat/a', defaultBranch: 'main' },
      },
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
      recording: {
        home: '/home/dev',
        remotes: [],
        worktreeBranches: {},
        pullRequestHeads: {},
        atc: {},
        sessions: [{ name: 'one', entries: [{ case: 'R9' }] }],
      },
      cases: [],
      stateDir: ctx.stateDir,
      atcRecordDir: ctx.atcRecordDir,
    }),
  ).rejects.toThrowWithMessage(Error, /the corpus lacks: R9/u);
});
