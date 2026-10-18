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
