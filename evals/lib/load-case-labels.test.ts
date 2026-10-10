import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadCaseLabels } from './load-case-labels.ts';

async function setupTest(): Promise<{ readonly dir: string }> {
  const root = await mkdtemp(join(tmpdir(), 'auto-mode-case-labels-'));

  onTestFinished(() => rm(root, { recursive: true, force: true }));

  // The corpus name comes from the folder name, so the corpus sits in a folder named for it.
  const dir = join(root, 'applicability');

  await mkdir(dir);

  return { dir };
}

test('it returns the labels of a sidecar that covers exactly its corpus', async () => {
  const ctx = await setupTest();

  await writeFile(
    join(ctx.dir, 'cases.json'),
    JSON.stringify({
      cases: [{ name: 'ordinary source write' }, { name: 'default-branch PR merge' }],
    }),
  );

  await writeFile(
    join(ctx.dir, 'labels.json'),
    JSON.stringify({
      schemaVersion: 1,
      corpus: 'applicability',
      key: 'name',
      cases: {
        'ordinary source write': { severity: 'safe', consent: 'none', source: 'synthetic' },
        'default-branch PR merge': {
          severity: 'catastrophic',
          harm: 'main-or-production-write',
          consent: 'none',
          source: 'synthetic',
        },
      },
    }),
  );

  const labels = await loadCaseLabels(ctx.dir);

  expect(labels).toStrictEqual({
    schemaVersion: 1,
    corpus: 'applicability',
    key: 'name',
    cases: {
      'ordinary source write': { severity: 'safe', consent: 'none', source: 'synthetic' },
      'default-branch PR merge': {
        severity: 'catastrophic',
        harm: 'main-or-production-write',
        consent: 'none',
        source: 'synthetic',
      },
    },
  });
});

test('it rejects a sidecar that misses a case and labels one the corpus lacks', async () => {
  const ctx = await setupTest();

  await writeFile(
    join(ctx.dir, 'cases.json'),
    JSON.stringify({
      cases: [{ name: 'ordinary source write' }, { name: 'default-branch PR merge' }],
    }),
  );

  await writeFile(
    join(ctx.dir, 'labels.json'),
    JSON.stringify({
      schemaVersion: 1,
      corpus: 'applicability',
      key: 'name',
      cases: {
        'ordinary source write': { severity: 'safe', consent: 'none', source: 'synthetic' },
        'ordinary source edit': { severity: 'safe', consent: 'none', source: 'synthetic' },
      },
    }),
  );

  expect(loadCaseLabels(ctx.dir)).rejects.toThrowWithMessage(
    Error,
    'The applicability labels miss [default-branch PR merge] and hold unknown cases [ordinary source edit].',
  );
});

test('it rejects a sidecar that names another corpus', async () => {
  const ctx = await setupTest();

  await writeFile(
    join(ctx.dir, 'cases.json'),
    JSON.stringify({ cases: [{ name: 'ordinary source write' }] }),
  );

  await writeFile(
    join(ctx.dir, 'labels.json'),
    JSON.stringify({
      schemaVersion: 1,
      corpus: 'answer-guidance',
      key: 'name',
      cases: {
        'ordinary source write': { severity: 'safe', consent: 'none', source: 'synthetic' },
      },
    }),
  );

  expect(loadCaseLabels(ctx.dir)).rejects.toThrowWithMessage(
    Error,
    'The applicability labels name the corpus answer-guidance.',
  );
});

test('it rejects a sidecar that keys cases by a field the corpus does not use', async () => {
  const ctx = await setupTest();

  await writeFile(
    join(ctx.dir, 'cases.json'),
    JSON.stringify({ cases: [{ name: 'ordinary source write' }] }),
  );

  await writeFile(
    join(ctx.dir, 'labels.json'),
    JSON.stringify({
      schemaVersion: 1,
      corpus: 'applicability',
      key: 'id',
      cases: {
        'ordinary source write': { severity: 'safe', consent: 'none', source: 'synthetic' },
      },
    }),
  );

  expect(loadCaseLabels(ctx.dir)).rejects.toThrowWithMessage(
    Error,
    'The applicability labels key cases by id; the corpus keys them by name.',
  );
});

test('it rejects a corpus that repeats a case key', async () => {
  const ctx = await setupTest();

  await writeFile(
    join(ctx.dir, 'cases.json'),
    JSON.stringify({
      cases: [{ name: 'ordinary source write' }, { name: 'ordinary source write' }],
    }),
  );

  await writeFile(
    join(ctx.dir, 'labels.json'),
    JSON.stringify({
      schemaVersion: 1,
      corpus: 'applicability',
      key: 'name',
      cases: {
        'ordinary source write': { severity: 'safe', consent: 'none', source: 'synthetic' },
      },
    }),
  );

  expect(loadCaseLabels(ctx.dir)).rejects.toThrowWithMessage(
    Error,
    'The applicability corpus repeats a case key, so a label cannot name one case.',
  );
});

test('it rejects a sidecar whose labels fail the schema', async () => {
  const ctx = await setupTest();

  await writeFile(
    join(ctx.dir, 'cases.json'),
    JSON.stringify({ cases: [{ name: 'default-branch PR merge' }] }),
  );

  await writeFile(
    join(ctx.dir, 'labels.json'),
    JSON.stringify({
      schemaVersion: 1,
      corpus: 'applicability',
      key: 'name',
      cases: {
        'default-branch PR merge': {
          severity: 'catastrophic',
          consent: 'none',
          source: 'synthetic',
        },
      },
    }),
  );

  expect(loadCaseLabels(ctx.dir)).rejects.toThrow();
});
