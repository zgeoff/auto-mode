import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, test } from 'vitest';
import { loadPolicy } from './load-policy.ts';

const dirs: string[] = [];

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function writeFiles(classifier: string, rules: string): Promise<[string, string]> {
  const dir = await mkdtemp(join(tmpdir(), 'auto-mode-'));

  dirs.push(dir);

  const classifierPath = join(dir, 'classifier.md');
  const rulesPath = join(dir, 'rules.md');

  await Promise.all([writeFile(classifierPath, classifier), writeFile(rulesPath, rules)]);

  return [classifierPath, rulesPath];
}

test('it reads the shipped policy and leaves no marker behind', async () => {
  const prompt = await loadPolicy();

  expect(prompt).not.toContain('<rules>');
  expect(prompt).toContain('## HARD BLOCK rules');
  expect(prompt).toContain('## ALLOW exceptions');
  expect(prompt).toContain('## Output contract');
});

test('it puts the rules where the marker was', async () => {
  const [classifierPath, rulesPath] = await writeFiles('before\n\n<rules>\n\nafter\n', '  RULES  ');

  await expect(loadPolicy({ classifierPath, rulesPath })).resolves.toBe(
    'before\n\nRULES\n\nafter\n',
  );
});

// A classifier file with no marker would silently drop every rule, which reads
// as a policy that blocks nothing. Fail loudly instead.
test('it refuses a classifier file that has nowhere to put the rules', async () => {
  const [classifierPath, rulesPath] = await writeFiles('no marker here', 'RULES');

  await expect(loadPolicy({ classifierPath, rulesPath })).rejects.toThrow(/has no <rules> line/);
});
