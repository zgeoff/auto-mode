import { expect, onTestFinished, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkOwnerNames } from './check-owner-names.ts';

async function setupTest() {
  const root = await mkdtemp(join(tmpdir(), 'owner-names-'));

  onTestFinished(() => rm(root, { recursive: true, force: true }));

  return { root };
}

test('it passes files that use only invented names and placeholders', async () => {
  const ctx = await setupTest();

  const domain = createHash('sha256').update('owner.example').digest('hex');
  const login = createHash('sha256').update('pat').digest('hex');

  await Bun.write(
    join(ctx.root, 'docs/guide.md'),
    [
      'url=https://judge.example.com',
      'host=box.notowner.example',
      'home=/home/robin/projects',
      'ref=op://$OP_VAULT/item/secret',
      'other=op://{vault}/item',
      'doc=op://<vault>/item op://vault/item op://example/item',
      '',
    ].join('\n'),
  );

  expect(
    checkOwnerNames(ctx.root, ['docs/guide.md'], {
      domains: new Set([domain]),
      logins: new Set([login]),
    }),
  ).toStrictEqual([]);
});

test('it reports the owner domain, home path, and vault by file and line', async () => {
  const ctx = await setupTest();

  const domain = createHash('sha256').update('owner.example').digest('hex');
  const login = createHash('sha256').update('pat').digest('hex');

  await Bun.write(
    join(ctx.root, 'src/a.ts'),
    "const url = 'https://judge.owner.example';\nconst apex = 'OWNER.example';\n",
  );

  await Bun.write(
    join(ctx.root, 'evals/corpora/a/cases.json'),
    '{ "command": "op read op://team-vault/item/secret" }\n\n{ "cwd": "/Users/pat/.ssh" }\n',
  );

  expect(
    checkOwnerNames(ctx.root, ['src/a.ts', 'evals/corpora/a/cases.json'], {
      domains: new Set([domain]),
      logins: new Set([login]),
    }),
  ).toStrictEqual([
    { file: 'src/a.ts', line: 1, message: 'owner domain' },
    { file: 'src/a.ts', line: 2, message: 'owner domain' },
    { file: 'evals/corpora/a/cases.json', line: 1, message: 'vault outside the allow list' },
    { file: 'evals/corpora/a/cases.json', line: 3, message: 'owner home path' },
  ]);
});

test.each([
  ['a subdomain of the owner domain', 'https://deep.judge.owner.example:8443/v1', 'owner domain'],
  ['the owner domain in capitals', 'Host: OWNER.EXAMPLE', 'owner domain'],
  ['the owner domain with a trailing dot', 'dig owner.example.', 'owner domain'],
  ['the owner domain in an email', 'mail pat@owner.example', 'owner domain'],
  ['a macOS home path', 'cd /Users/pat/projects', 'owner home path'],
  ['a home path that ends a sentence', 'It sits in /home/pat.', 'owner home path'],
  ['a home path before a comma', 'Use /home/pat, then stop.', 'owner home path'],
  ['a home path in capitals', 'cd /Users/Pat/notes', 'owner home path'],
  [
    'a vault outside the allow list',
    'op read op://team-vault/item/token',
    'vault outside the allow list',
  ],
  ['an allowed vault in capitals', 'op read op://Vault/item/token', 'vault outside the allow list'],
  [
    'a vault that only starts with an allowed name',
    'op read op://vaults/item',
    'vault outside the allow list',
  ],
  [
    'a vault that extends an allowed name',
    'op read op://example-real/item',
    'vault outside the allow list',
  ],
  ['an empty vault name', 'op read op:///item/token', 'vault outside the allow list'],
])('it refuses %s', async (_label, line, message) => {
  const ctx = await setupTest();

  const domain = createHash('sha256').update('owner.example').digest('hex');
  const login = createHash('sha256').update('pat').digest('hex');

  await Bun.write(join(ctx.root, 'docs/a.md'), `${line}\n`);

  expect(
    checkOwnerNames(ctx.root, ['docs/a.md'], {
      domains: new Set([domain]),
      logins: new Set([login]),
    }),
  ).toStrictEqual([{ file: 'docs/a.md', line: 1, message }]);
});

test.each([
  ['a domain that only ends with the owner domain text', 'https://notowner.example'],
  ['a domain that extends the owner domain', 'https://owner.example.org'],
  ['a domain with a hyphen in place of the dot', 'https://owner-example.com'],
  ['a login that only starts with the owner login', 'cd /home/patrick/projects'],
  ['an allowed vault', 'op read op://vault/item/token'],
  ['a vault placeholder', 'op read op://$OP_VAULT/item/token'],
])('it passes %s', async (_label, line) => {
  const ctx = await setupTest();

  const domain = createHash('sha256').update('owner.example').digest('hex');
  const login = createHash('sha256').update('pat').digest('hex');

  await Bun.write(join(ctx.root, 'docs/a.md'), `${line}\n`);

  expect(
    checkOwnerNames(ctx.root, ['docs/a.md'], {
      domains: new Set([domain]),
      logins: new Set([login]),
    }),
  ).toStrictEqual([]);
});

test('it skips a file that is gone from the tree or binary', async () => {
  const ctx = await setupTest();

  // a vault outside the allow list, behind a NUL byte
  await Bun.write(join(ctx.root, 'fixtures/logo.bin'), '\0op://team-vault/item/secret\n');

  expect(
    checkOwnerNames(ctx.root, ['fixtures/logo.bin', 'deleted.ts'], {
      domains: new Set(),
      logins: new Set(),
    }),
  ).toStrictEqual([]);
});
