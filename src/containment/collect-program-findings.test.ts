import { expect, test } from 'bun:test';
import { buildMockOwnedScope } from '../../test-utils/factories/build-mock-owned-scope.ts';
import { collectProgramFindings } from './collect-program-findings.ts';

test('it finds nothing in a program the table does not list', () => {
  const findings = collectProgramFindings(
    'rm',
    ['/other/a'],
    {
      directory: '/work',
      cwd: '/work',
      scope: buildMockOwnedScope({ home: '/home/dev', worktrees: ['/work'] }),
      scratchPaths: [],
    },
    {},
  );

  expect(findings).toStrictEqual([]);
});

test.each([
  ['all', ['/other/a', '/other/b'], ['/other/a', '/other/b']],
  ['first', ['/other/a', '/other/b'], ['/other/a']],
  ['after-script', ['s/a/b/', '/other/a'], ['/other/a']],
  ['destination', ['/other/a', '/other/b'], ['/other/b']],
  ['destination', ['/other/a'], []],
  ['sources', ['/other/a', '/other/b', '/other/c'], ['/other/a', '/other/b']],
] as const)('it reads the %s operands of %j as %j', (selector, args, targets) => {
  const findings = collectProgramFindings(
    'tool',
    args,
    {
      directory: '/work',
      cwd: '/work',
      scope: buildMockOwnedScope({ home: '/home/dev', worktrees: ['/work'] }),
      scratchPaths: [],
    },
    { tool: { writes: [{ operands: [selector] }] } },
  );

  expect(findings).toStrictEqual(
    targets.map((target) => ({ kind: 'path', target, grant: { kind: 'path' } })),
  );
});

test('it reads every operand as a source once an option names the destination', () => {
  const findings = collectProgramFindings(
    'tool',
    ['-t', '/other/dir', '/other/a', '/other/b'],
    {
      directory: '/work',
      cwd: '/work',
      scope: buildMockOwnedScope({ home: '/home/dev', worktrees: ['/work'] }),
      scratchPaths: [],
    },
    {
      tool: {
        valueOptions: ['-t'],
        writes: [{ options: ['-t'], operands: ['destination', 'sources'] }],
      },
    },
  );

  expect(findings).toStrictEqual([
    { kind: 'path', target: '/other/dir', grant: { kind: 'path' } },
    { kind: 'path', target: '/other/a', grant: { kind: 'path' } },
    { kind: 'path', target: '/other/b', grant: { kind: 'path' } },
  ]);
});

test('it reads every operand after a script option as a file', () => {
  const findings = collectProgramFindings(
    'tool',
    ['-e', 's/a/b/', '/other/a'],
    {
      directory: '/work',
      cwd: '/work',
      scope: buildMockOwnedScope({ home: '/home/dev', worktrees: ['/work'] }),
      scratchPaths: [],
    },
    {
      tool: {
        valueOptions: ['-e'],
        writes: [{ operands: ['after-script'], scriptOptions: ['-e'] }],
      },
    },
  );

  expect(findings).toStrictEqual([{ kind: 'path', target: '/other/a', grant: { kind: 'path' } }]);
});

test.each([
  ['a separate word', ['--out', '/other/a']],
  ['an attached long form', ['--out=/other/a']],
  ['an attached short form', ['-o/other/a']],
])('it reads an option value written as %s', (_form, args) => {
  const findings = collectProgramFindings(
    'tool',
    args,
    {
      directory: '/work',
      cwd: '/work',
      scope: buildMockOwnedScope({ home: '/home/dev', worktrees: ['/work'] }),
      scratchPaths: [],
    },
    {
      tool: {
        valueOptions: ['--out', '-o'],
        writes: [{ options: ['--out', '-o'] }],
      },
    },
  );

  expect(findings).toStrictEqual([{ kind: 'path', target: '/other/a', grant: { kind: 'path' } }]);
});

test('it skips the value of a value option when it collects operands', () => {
  const findings = collectProgramFindings(
    'tool',
    ['-m', 'note', '/other/a'],
    {
      directory: '/work',
      cwd: '/work',
      scope: buildMockOwnedScope({ home: '/home/dev', worktrees: ['/work'] }),
      scratchPaths: [],
    },
    { tool: { valueOptions: ['-m'], writes: [{ operands: ['first'] }] } },
  );

  expect(findings).toStrictEqual([{ kind: 'path', target: '/other/a', grant: { kind: 'path' } }]);
});

test('it reads a word after -- as an operand', () => {
  const findings = collectProgramFindings(
    'tool',
    ['--', '-f'],
    {
      directory: '/other',
      cwd: '/work',
      scope: buildMockOwnedScope({ home: '/home/dev', worktrees: ['/work'] }),
      scratchPaths: [],
    },
    { tool: { writes: [{ operands: ['all'] }] } },
  );

  expect(findings).toStrictEqual([{ kind: 'path', target: '/other/-f', grant: { kind: 'path' } }]);
});

test('it reads every word after the first operand as an operand when options end there', () => {
  const findings = collectProgramFindings(
    'tool',
    ['/other/a', '-r', '/other/b'],
    {
      directory: '/other',
      cwd: '/work',
      scope: buildMockOwnedScope({ home: '/home/dev', worktrees: ['/work'] }),
      scratchPaths: [],
    },
    { tool: { optionsEndAtOperand: true, writes: [{ operands: ['all'] }] } },
  );

  expect(findings).toStrictEqual([
    { kind: 'path', target: '/other/a', grant: { kind: 'path' } },
    { kind: 'path', target: '/other/-r', grant: { kind: 'path' } },
    { kind: 'path', target: '/other/b', grant: { kind: 'path' } },
  ]);
});

test.each([
  ['a write flag it needs', ['/other/a'], []],
  ['the write flag', ['--force', '/other/a'], ['/other/a']],
  ['a read flag beside the write flag', ['--force', '--dry-run', '/other/a'], []],
] as const)('it applies a rule to a call with %s as written', (_label, args, targets) => {
  const findings = collectProgramFindings(
    'tool',
    args,
    {
      directory: '/work',
      cwd: '/work',
      scope: buildMockOwnedScope({ home: '/home/dev', worktrees: ['/work'] }),
      scratchPaths: [],
    },
    { tool: { writes: [{ flags: ['--force'], readFlags: ['--dry-run'], operands: ['all'] }] } },
  );

  expect(findings).toStrictEqual(
    targets.map((target) => ({ kind: 'path', target, grant: { kind: 'path' } })),
  );
});

test.each([
  ['every pattern matches', ['ship', 'to-prod'], [{ kind: 'remote-write', target: 'tool' }]],
  ['one pattern matches no word', ['ship', 'to-staging'], []],
] as const)('it applies a word rule when %s', (_label, args, findings) => {
  expect(
    collectProgramFindings(
      'tool',
      args,
      {
        directory: '/work',
        cwd: '/work',
        scope: buildMockOwnedScope({ home: '/home/dev', worktrees: ['/work'] }),
        scratchPaths: [],
      },
      { tool: { writes: [{ words: [/^ship$/u, /prod/u], finding: { kind: 'remote-write' } }] } },
    ),
  ).toStrictEqual([...findings]);
});

test.each([
  ['a separate word', ['-X', 'POST'], [{ kind: 'remote-write', target: 'tool' }]],
  ['an attached form', ['-XPOST'], [{ kind: 'remote-write', target: 'tool' }]],
  ['a value that does not match', ['-X', 'GET'], []],
] as const)(
  'it applies an option value rule to a value written as %s',
  (_label, args, findings) => {
    expect(
      collectProgramFindings(
        'tool',
        args,
        {
          directory: '/work',
          cwd: '/work',
          scope: buildMockOwnedScope({ home: '/home/dev', worktrees: ['/work'] }),
          scratchPaths: [],
        },
        {
          tool: {
            valueOptions: ['-X'],
            writes: [
              {
                optionValue: { options: ['-X'], value: /^POST$/u },
                finding: { kind: 'remote-write' },
              },
            ],
          },
        },
      ),
    ).toStrictEqual([...findings]);
  },
);

test('it reads the words after a subcommand through the subcommand entry alone', () => {
  const findings = collectProgramFindings(
    'tool',
    ['--verbose', 'purge', '-f'],
    {
      directory: '/work',
      cwd: '/work',
      scope: buildMockOwnedScope({ home: '/home/dev', worktrees: ['/work'] }),
      scratchPaths: [],
    },
    {
      tool: {
        subcommands: { purge: { writes: [{ finding: { kind: 'prune', quote: 'call' } }] } },
        writes: [{ finding: { kind: 'remote-write' } }],
      },
    },
  );

  expect(findings).toStrictEqual([{ kind: 'prune', target: 'tool --verbose purge -f' }]);
});

test.each([
  [
    'a word the pattern matches',
    ['create-key'],
    [{ kind: 'credential', target: 'tool create-key' }],
  ],
  ['a word the pattern does not match', ['list-keys'], []],
] as const)('it reads %s through the other-subcommand entry', (_label, args, findings) => {
  expect(
    collectProgramFindings(
      'tool',
      args,
      {
        directory: '/work',
        cwd: '/work',
        scope: buildMockOwnedScope({ home: '/home/dev', worktrees: ['/work'] }),
        scratchPaths: [],
      },
      {
        tool: {
          otherSubcommand: {
            pattern: /^create-/u,
            entry: { writes: [{ finding: { kind: 'credential' } }] },
          },
        },
      },
    ),
  ).toStrictEqual([...findings]);
});

test('it finds nothing in a subcommand named by an inherited object key', () => {
  const findings = collectProgramFindings(
    'tool',
    ['constructor'],
    {
      directory: '/work',
      cwd: '/work',
      scope: buildMockOwnedScope({ home: '/home/dev', worktrees: ['/work'] }),
      scratchPaths: [],
    },
    { tool: { subcommands: {} } },
  );

  expect(findings).toStrictEqual([]);
});

test.each([
  ['a host path', ['./a', 'host:/srv/a'], [{ kind: 'remote-write', target: 'tool' }]],
  [
    'a local path',
    ['host:/srv/a', '/other/a'],
    [{ kind: 'path', target: '/other/a', grant: { kind: 'path' } }],
  ],
] as const)('it reads a remote-path destination that is %s', (_label, args, findings) => {
  expect(
    collectProgramFindings(
      'tool',
      args,
      {
        directory: '/work',
        cwd: '/work',
        scope: buildMockOwnedScope({ home: '/home/dev', worktrees: ['/work'] }),
        scratchPaths: [],
      },
      {
        tool: {
          writes: [
            { operands: ['destination'], role: 'remote-path', finding: { kind: 'remote-write' } },
          ],
        },
      },
    ),
  ).toStrictEqual([...findings]);
});

test.each([
  ['a local URL', ['http://localhost:3000/api'], []],
  ['a remote URL', ['https://api.example.com/x'], [{ kind: 'remote-write', target: 'tool' }]],
  ['no URL', ['data'], [{ kind: 'remote-write', target: 'tool' }]],
] as const)('it reads a url target in a call with %s', (_label, args, findings) => {
  expect(
    collectProgramFindings(
      'tool',
      args,
      {
        directory: '/work',
        cwd: '/work',
        scope: buildMockOwnedScope({ home: '/home/dev', worktrees: ['/work'] }),
        scratchPaths: [],
      },
      { tool: { writes: [{ operands: ['all'], role: 'url', finding: { kind: 'remote-write' } }] } },
    ),
  ).toStrictEqual([...findings]);
});

test.each([
  ['no host', [], []],
  ['a listed read', ['host', 'uptime'], []],
  [
    'a listed read behind an operator',
    ['host', 'uptime; reboot'],
    [{ kind: 'remote-write', target: 'tool' }],
  ],
  ['another program', ['host', 'reboot'], [{ kind: 'remote-write', target: 'tool' }]],
] as const)('it reads a remote command with %s', (_label, args, findings) => {
  expect(
    collectProgramFindings(
      'tool',
      args,
      {
        directory: '/work',
        cwd: '/work',
        scope: buildMockOwnedScope({ home: '/home/dev', worktrees: ['/work'] }),
        scratchPaths: [],
      },
      {
        tool: {
          writes: [
            {
              operands: ['all'],
              role: 'remote-command',
              reads: ['uptime'],
              finding: { kind: 'remote-write' },
            },
          ],
        },
      },
    ),
  ).toStrictEqual([...findings]);
});

test.each([
  ['a value option that ends the cluster', ['-vo', '/other/a', 'x'], ['/other/a']],
  ['a value option with its value attached', ['-vo/other/a', 'x'], ['/other/a']],
  ['flags alone', ['-vq', '/other/b'], []],
] as const)('it splits a short option cluster with %s', (_label, args, targets) => {
  const findings = collectProgramFindings(
    'tool',
    args,
    {
      directory: '/work',
      cwd: '/work',
      scope: buildMockOwnedScope({ home: '/home/dev', worktrees: ['/work'] }),
      scratchPaths: [],
    },
    { tool: { valueOptions: ['-o'], writes: [{ options: ['-o'] }] } },
  );

  expect(findings).toStrictEqual(
    targets.map((target) => ({ kind: 'path', target, grant: { kind: 'path' } })),
  );
});

test('it resolves a path against the directory a directory option moves to', () => {
  const findings = collectProgramFindings(
    'tool',
    ['-C', '../other', 'remove', 'a'],
    {
      directory: '/repo/work',
      cwd: '/repo/work',
      scope: buildMockOwnedScope({ home: '/home/dev', worktrees: ['/repo/work'] }),
      scratchPaths: [],
    },
    {
      tool: {
        directoryOptions: ['-C'],
        subcommands: { remove: { writes: [{ operands: ['first'] }] } },
      },
    },
  );

  expect(findings).toStrictEqual([
    { kind: 'path', target: '/repo/other/a', grant: { kind: 'path' } },
  ]);
});

test('it finds a directory write run outside the task scope, which no message can grant', () => {
  const findings = collectProgramFindings(
    'tool',
    ['-C', '/repo/other', 'commit'],
    {
      directory: '/repo/work',
      cwd: '/repo/work',
      scope: buildMockOwnedScope({ home: '/home/dev', worktrees: ['/repo/work'] }),
      scratchPaths: [],
    },
    {
      tool: {
        directoryOptions: ['-C'],
        subcommands: { commit: { writes: [{ directory: true }] } },
      },
    },
  );

  expect(findings).toStrictEqual([{ kind: 'path', target: '/repo/other' }]);
});

test('it quotes the program, its subcommands and the first operand in a finding target', () => {
  const findings = collectProgramFindings(
    'tool',
    ['set', '--global', 'user.email', 'dev@example.com'],
    {
      directory: '/work',
      cwd: '/work',
      scope: buildMockOwnedScope({ home: '/home/dev', worktrees: ['/work'] }),
      scratchPaths: [],
    },
    {
      tool: {
        subcommands: {
          set: {
            writes: [{ flags: ['--global'], finding: { kind: 'credential', quote: 'operand' } }],
          },
        },
      },
    },
  );

  expect(findings).toStrictEqual([{ kind: 'credential', target: 'tool set user.email' }]);
});

test.each([
  [
    'an unowned branch',
    ['delete', 'spike', 'feature'],
    [{ kind: 'branch', target: 'spike', grant: { kind: 'branch' } }],
  ],
  ['only owned branches', ['delete', 'feature'], []],
] as const)('it reads branch targets naming %s', (_label, args, findings) => {
  expect(
    collectProgramFindings(
      'tool',
      args,
      {
        directory: '/work',
        cwd: '/work',
        scope: buildMockOwnedScope({
          home: '/home/dev',
          worktrees: ['/work'],
          branches: ['feature'],
        }),
        scratchPaths: [],
      },
      { tool: { subcommands: { delete: { writes: [{ operands: ['all'], role: 'branch' }] } } } },
    ),
  ).toStrictEqual([...findings]);
});

test.each([
  ['an owned remote by name', 'origin', []],
  ['an owned remote by URL', 'https://github.com/dev/app.git', []],
  ['a remote held in a variable', '$REMOTE', []],
  [
    'another remote',
    'git@github.com:dev/fork.git',
    [{ kind: 'remote-write', target: 'git@github.com:dev/fork.git' }],
  ],
] as const)('it reads a remote target naming %s', (_label, remote, findings) => {
  expect(
    collectProgramFindings(
      'tool',
      [remote],
      {
        directory: '/work',
        cwd: '/work',
        scope: buildMockOwnedScope({
          home: '/home/dev',
          worktrees: ['/work'],
          remotes: [{ name: 'origin', url: 'git@github.com:dev/app.git' }],
        }),
        scratchPaths: [],
      },
      { tool: { writes: [{ operands: ['first'], role: 'remote' }] } },
    ),
  ).toStrictEqual([...findings]);
});

test.each([
  [
    'the current branch in the cwd',
    '/work',
    [{ kind: 'branch', target: 'main', grant: { kind: 'branch' } }],
  ],
  ['an unknown current branch in another directory', '/elsewhere', []],
] as const)('it reads a missing refspec as %s', (_label, directory, findings) => {
  expect(
    collectProgramFindings(
      'tool',
      ['origin'],
      {
        directory,
        cwd: '/work',
        scope: buildMockOwnedScope({
          home: '/home/dev',
          worktrees: ['/work'],
          currentBranch: 'main',
        }),
        scratchPaths: [],
      },
      { tool: { writes: [{ operands: ['after-first'], role: 'refspec', whenNone: 'HEAD' }] } },
    ),
  ).toStrictEqual([...findings]);
});

test.each([
  [
    'a force push to another branch',
    '+HEAD:refs/heads/release',
    [{ kind: 'branch', target: 'release', grant: { kind: 'branch' } }],
  ],
  ['a tag', 'refs/tags/v1', []],
  ['an owned branch', 'local:feature', []],
] as const)('it reads a refspec naming %s', (_label, refspec, findings) => {
  expect(
    collectProgramFindings(
      'tool',
      ['origin', refspec],
      {
        directory: '/work',
        cwd: '/work',
        scope: buildMockOwnedScope({
          home: '/home/dev',
          worktrees: ['/work'],
          branches: ['feature'],
        }),
        scratchPaths: [],
      },
      { tool: { writes: [{ operands: ['after-first'], role: 'refspec' }] } },
    ),
  ).toStrictEqual([...findings]);
});

test.each([
  ['another commit', ['origin/main'], [{ kind: 'discard', target: 'reset origin/main' }]],
  ['the current commit', ['HEAD'], []],
  ['no commit', [], []],
] as const)('it reads a commit target naming %s', (_label, args, findings) => {
  expect(
    collectProgramFindings(
      'tool',
      args,
      {
        directory: '/work',
        cwd: '/work',
        scope: buildMockOwnedScope({ home: '/home/dev', worktrees: ['/work'] }),
        scratchPaths: [],
      },
      {
        tool: {
          writes: [
            {
              operands: ['first'],
              role: 'commit',
              finding: { kind: 'discard', target: 'reset' },
            },
          ],
        },
      },
    ),
  ).toStrictEqual([...findings]);
});

test.each([
  ['a write to the owned pull request', 'pull-request', ['12'], []],
  [
    'a merge of the owned pull request',
    'pull-request-merge',
    ['12'],
    [{ kind: 'remote-write', target: 'tool', grant: { kind: 'pull-request', number: 12 } }],
  ],
  [
    'a merge with an ungranting flag',
    'pull-request-merge',
    ['12', '--admin'],
    [{ kind: 'remote-write', target: 'tool' }],
  ],
  [
    'a write to an owned number in another repository',
    'pull-request',
    ['12', '--repo', 'other/app'],
    [{ kind: 'remote-write', target: 'tool', grant: { kind: 'pull-request', number: 12 } }],
  ],
  [
    'a write to the owned pull request by its URL',
    'pull-request',
    ['https://github.com/dev/app/pull/12'],
    [],
  ],
  [
    'a write to a pull request named by its branch',
    'pull-request',
    ['feat/x'],
    [{ kind: 'remote-write', target: 'tool' }],
  ],
] as const)('it reads %s', (_label, role, args, findings) => {
  expect(
    collectProgramFindings(
      'tool',
      args,
      {
        directory: '/work',
        cwd: '/work',
        scope: buildMockOwnedScope({
          home: '/home/dev',
          worktrees: ['/work'],
          remotes: [{ name: 'origin', url: 'git@github.com:dev/app.git' }],
          pullRequests: [{ number: 12, repository: 'github.com/dev/app' }],
        }),
        scratchPaths: [],
      },
      {
        tool: {
          valueOptions: ['--repo'],
          writes: [
            {
              operands: ['first'],
              role,
              repoOptions: ['--repo'],
              ungrantFlags: ['--admin'],
              finding: { kind: 'remote-write' },
            },
          ],
        },
      },
    ),
  ).toStrictEqual([...findings]);
});

test.each([
  ['a comment on the owned pull request', 'repos/dev/app/issues/12/comments', []],
  [
    'a merge of the owned pull request',
    'repos/dev/app/pulls/12/merge',
    [{ kind: 'remote-write', target: 'tool repos/dev/app/pulls/12/merge' }],
  ],
  [
    'a path the credential pattern matches',
    'repos/dev/app/keys',
    [{ kind: 'credential', target: 'tool repos/dev/app/keys' }],
  ],
] as const)('it reads a forge path for %s', (_label, path, findings) => {
  expect(
    collectProgramFindings(
      'tool',
      [path],
      {
        directory: '/work',
        cwd: '/work',
        scope: buildMockOwnedScope({
          home: '/home/dev',
          worktrees: ['/work'],
          pullRequests: [{ number: 12, repository: 'github.com/dev/app' }],
        }),
        scratchPaths: [],
      },
      {
        tool: {
          writes: [
            {
              operands: ['first'],
              role: 'forge-path',
              credentialPattern: /keys/u,
              finding: { kind: 'remote-write' },
            },
          ],
        },
      },
    ),
  ).toStrictEqual([...findings]);
});
