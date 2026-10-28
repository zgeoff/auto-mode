import { expect, test } from 'bun:test';
import { buildSecretFreeText } from './build-secret-free-text.ts';

// Each fake secret is joined at runtime so that the repository's own secret
// scan does not read it as a leak.
test('it replaces every secret the rules find, each wherever it appears', () => {
  const token = ['ghp', '_', 'Zm9vYmFyYmF6cXV4MTIzNDU2Nzg5MGFiY2Rl'].join('');
  const key = ['AKIA', 'Z7QW3RTY5UIOP2LK'].join('');
  const text = `GH_TOKEN=${token} AWS_ACCESS_KEY_ID=${key} gh auth login --with-token ${token}`;

  expect(buildSecretFreeText(text, () => '[secret]')).toBe(
    'GH_TOKEN=[secret] AWS_ACCESS_KEY_ID=[secret] gh auth login --with-token [secret]',
  );
});

test('it returns text with no secret unchanged', () => {
  expect(buildSecretFreeText('git merge --no-edit origin/main', () => '[secret]')).toBe(
    'git merge --no-edit origin/main',
  );
});
