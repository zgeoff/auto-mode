import { expect, test } from 'bun:test';
import { findSecret } from './find-secret.ts';

// Each fake secret is joined at runtime so that the repository's own secret
// scan does not read it as a leak.
test('it finds a provider token and names the rule that matched it', () => {
  const token = ['ghp', '_', 'Zm9vYmFyYmF6cXV4MTIzNDU2Nzg5MGFiY2Rl'].join('');

  expect(findSecret({ text: `const t = '${token}';`, path: 'src/a.ts' })).toStrictEqual({
    rule: 'github-pat',
    secret: token,
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

test('it finds a key in a path that the prefilter does not skip', () => {
  const key = ['AKIA', 'Z7QW3RTY5UIOP2LK'].join('');

  expect(findSecret({ text: `aws_access_key_id = "${key}"`, path: 'src/a.ts' })).toStrictEqual({
    rule: 'aws-access-token',
    secret: key,
  });
});

test('it reads nothing in a path that the prefilter skips, such as a lockfile', () => {
  const key = ['AKIA', 'Z7QW3RTY5UIOP2LK'].join('');

  expect(
    findSecret({ text: `aws_access_key_id = "${key}"`, path: 'package-lock.json' }),
  ).toBeNull();
});

test('it finds a curl authorization header written across continuation lines', () => {
  const bearer = ['k9Xq2Lm', 'Pz8Rt4Wv7'].join('');
  const text = `# docs\n\ncurl https://api.example.com/v1 \\\n  -X POST \\\n  -H "Authorization: Bearer ${bearer}"\n`;

  expect(findSecret({ text, path: 'README.md' })).toStrictEqual({
    rule: 'curl-auth-header',
    secret: bearer,
  });
});

test('it reports no part of a composite secret on its own, such as an account host', () => {
  expect(
    findSecret({ text: 'host = "acme-prod.snowflakecomputing.com"\n', path: 'config.ts' }),
  ).toBeNull();
});

test.each([
  ['repeated curl words', `curl${' curl'.repeat(4000)} -H`],
  ['a long run of dashes', `-prd-${'-'.repeat(20_000)}`],
  ['a long auth0 host', `auth0.com${'a.'.repeat(10_000)}`],
])('it finishes on %s built to make a quadratic rule backtrack', (_label, text) => {
  expect(findSecret({ text, path: null })).toBeNull();
});
