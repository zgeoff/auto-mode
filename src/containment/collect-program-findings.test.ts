import { expect, test } from 'bun:test';
import { buildMockOwnedScope } from '../../test-utils/factories/build-mock-owned-scope.ts';
import { collectProgramFindings } from './collect-program-findings.ts';

test('it finds nothing in a program the table does not list', () => {
  const findings = collectProgramFindings(
    'rm',
    ['/other/a'],
    {
      directory: '/work',
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
        scope: buildMockOwnedScope({ home: '/home/dev', worktrees: ['/work'] }),
        scratchPaths: [],
      },
      { tool: { writes: [{ words: [/^ship$/u, /prod/u], finding: { kind: 'remote-write' } }] } },
    ),
  ).toStrictEqual(findings);
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
    ).toStrictEqual(findings);
  },
);

test('it reads the words after a subcommand through the subcommand entry alone', () => {
  const findings = collectProgramFindings(
    'tool',
    ['--verbose', 'purge', '-f'],
    {
      directory: '/work',
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
  ).toStrictEqual(findings);
});

test('it finds nothing in a subcommand named by an inherited object key', () => {
  const findings = collectProgramFindings(
    'tool',
    ['constructor'],
    {
      directory: '/work',
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
  ).toStrictEqual(findings);
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
        scope: buildMockOwnedScope({ home: '/home/dev', worktrees: ['/work'] }),
        scratchPaths: [],
      },
      { tool: { writes: [{ operands: ['all'], role: 'url', finding: { kind: 'remote-write' } }] } },
    ),
  ).toStrictEqual(findings);
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
  ).toStrictEqual(findings);
});
