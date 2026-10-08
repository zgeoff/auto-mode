import { expect, test } from 'bun:test';
import { findSecret } from './find-secret.ts';

// Each secret is joined at runtime so that the repository's own secret scan
// does not read these fake values as leaks.
function setupTest() {
  return {
    githubToken: ['ghp', '_', 'Zm9vYmFyYmF6cXV4MTIzNDU2Nzg5MGFiY2Rl'].join(''),
    awsKey: ['AKIA', 'Z7QW3RTY5UIOP2LK'].join(''),
    bearer: ['k9Xq2Lm', 'Pz8Rt4Wv7'].join(''),
  };
}

test('it finds a provider token and names the rule that matched it', () => {
  const ctx = setupTest();

  expect(findSecret({ text: `const t = '${ctx.githubToken}';`, path: 'src/a.ts' })).toStrictEqual({
    rule: 'github-pat',
    secret: ctx.githubToken,
  });
});

test('it drops a match that the rule filter marks as low entropy', () => {
  expect(
    findSecret({ text: `aws_access_key_id = "AKIA${'A'.repeat(16)}"`, path: 'src/a.ts' }),
  ).toBeNull();
});

test('it drops a match that the global filter marks as a template placeholder', () => {
  const text = ['api_key = "$', '{{ secrets.API_KEY }}"'].join('');

  expect(findSecret({ text, path: 'ci.yml' })).toBeNull();
});

test('it reads nothing in a path that the prefilter skips, such as a lockfile', () => {
  const ctx = setupTest();

  expect(
    findSecret({ text: `aws_access_key_id = "${ctx.awsKey}"`, path: 'package-lock.json' }),
  ).toBeNull();
});

test('it finds a curl authorization header written across continuation lines', () => {
  const ctx = setupTest();
  const text = `# docs\n\ncurl https://api.example.com/v1 \\\n  -X POST \\\n  -H "Authorization: Bearer ${ctx.bearer}"\n`;

  expect(findSecret({ text, path: 'README.md' })).toStrictEqual({
    rule: 'curl-auth-header',
    secret: ctx.bearer,
  });
});

test('it reports no part of a composite secret on its own, such as an account host', () => {
  expect(
    findSecret({ text: 'host = "acme-prod.snowflakecomputing.com"\n', path: 'config.ts' }),
  ).toBeNull();
});

test('it finishes on input built to make the quadratic rules backtrack', () => {
  expect(
    [
      `curl${' curl'.repeat(4000)} -H`,
      `-prd-${'-'.repeat(20_000)}`,
      `auth0.com${'a.'.repeat(10_000)}`,
    ].map((text) => findSecret({ text, path: null })),
  ).toStrictEqual([null, null, null]);
});
