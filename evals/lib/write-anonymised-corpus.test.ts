import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, readdir, realpath, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runGit } from '../../test-utils/run-git.ts';
import { writeAnonymisedCorpus } from './write-anonymised-corpus.ts';

async function setupTest(): Promise<{ readonly dir: string; readonly capture: string }> {
  const created = await mkdtemp(join(tmpdir(), 'anonymise-'));

  onTestFinished(() => rm(created, { recursive: true, force: true }));

  const dir = await realpath(created);

  return { dir, capture: join(dir, 'requests-2026-10-10.jsonl') };
}

test('it writes the anonymised cases and a labels to-do list outside every checkout', async () => {
  const ctx = await setupTest();

  await writeFile(
    ctx.capture,
    `${JSON.stringify({
      schemaVersion: 1,
      time: '2026-10-10T12:00:00.000Z',
      request: {
        sessionID: 's-1',
        cwd: '/home/robin/harbor',
        toolName: 'Bash',
        toolInput: { command: 'make -C /home/robin/harbor' },
        context: {
          agentID: null,
          originalUserTask: null,
          delegatedTask: null,
          lastDirectUserMessage: null,
          omittedTaskContext: [],
        },
      },
      verdict: { kind: 'allow' },
      decidingStage: 'jev',
      escalation: false,
    })}\n`,
  );

  const result = await writeAnonymisedCorpus({
    captureFiles: [ctx.capture],
    outDir: join(ctx.dir, 'recorded-traffic'),
    env: { PATH: process.env['PATH'] },
    salt: 'salt',
    stagingRoot: ctx.dir,
  });

  const casesText = await readFile(join(ctx.dir, 'recorded-traffic', 'cases.json'), 'utf8');
  const labelsText = await readFile(join(ctx.dir, 'recorded-traffic', 'labels.todo.json'), 'utf8');

  const cases: unknown = JSON.parse(casesText);
  const labels: unknown = JSON.parse(labelsText);

  expect(result).toStrictEqual({ outDir: join(ctx.dir, 'recorded-traffic'), cases: 1 });

  expect(cases).toStrictEqual({
    schemaVersion: 1,
    cases: [
      {
        id: 'recorded-0001',
        source: 'recorded',
        request: {
          sessionID: expect.toSatisfy((value: string) => /^session-[0-9a-f]{8}$/.test(value)),
          cwd: expect.toSatisfy((value: string) =>
            /^\/home\/user-[0-9a-f]{8}\/repo-[0-9a-f]{8}$/.test(value),
          ),
          toolName: 'Bash',
          toolInput: {
            command: expect.toSatisfy((value: string) =>
              /^make -C \/home\/user-[0-9a-f]{8}\/repo-[0-9a-f]{8}$/.test(value),
            ),
          },
          context: {
            agentID: null,
            originalUserTask: null,
            delegatedTask: null,
            lastDirectUserMessage: null,
            omittedTaskContext: [],
          },
        },
        recordedVerdict: { kind: 'allow' },
        decidingStage: 'jev',
      },
    ],
  });

  expect(labels).toStrictEqual({
    schemaVersion: 1,
    corpus: 'recorded-traffic',
    key: 'id',
    cases: { 'recorded-0001': { source: 'recorded' } },
  });
});

test('it refuses an out dir under evals/corpora of a repository, so unread cases stay out of git', async () => {
  const ctx = await setupTest();

  runGit(ctx.dir, ['init', '-q', '-b', 'main', join(ctx.dir, 'public')]);

  await mkdir(join(ctx.dir, 'public', 'evals', 'corpora'), { recursive: true });
  await writeFile(ctx.capture, '');

  const written = writeAnonymisedCorpus({
    captureFiles: [ctx.capture],
    outDir: join(ctx.dir, 'public', 'evals', 'corpora', 'recorded-traffic'),
    env: { PATH: process.env['PATH'] },
    salt: 'salt',
    stagingRoot: ctx.dir,
  });

  expect(written).rejects.toThrowWithMessage(
    Error,
    `Refusing to write into ${join(ctx.dir, 'public', 'evals', 'corpora', 'recorded-traffic')}: it is inside the git work tree ${join(ctx.dir, 'public')}. Write the corpus outside every repository, read every case, then copy the reviewed files into evals/corpora/.`,
  );
});

test('it refuses an out dir in any other git work tree', async () => {
  const ctx = await setupTest();

  runGit(ctx.dir, ['init', '-q', '-b', 'main', join(ctx.dir, 'other')]);

  await writeFile(ctx.capture, '');

  const written = writeAnonymisedCorpus({
    captureFiles: [ctx.capture],
    outDir: join(ctx.dir, 'other', 'corpus'),
    env: { PATH: process.env['PATH'] },
    salt: 'salt',
    stagingRoot: ctx.dir,
  });

  expect(written).rejects.toThrowWithMessage(
    Error,
    `Refusing to write into ${join(ctx.dir, 'other', 'corpus')}: it is inside the git work tree ${join(ctx.dir, 'other')}. Write the corpus outside every repository, read every case, then copy the reviewed files into evals/corpora/.`,
  );
});

test('it refuses an out dir that already exists and leaves it untouched', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.dir, 'existing'));
  await writeFile(join(ctx.dir, 'existing', 'keep.txt'), 'keep');
  await writeFile(ctx.capture, '');

  const written = writeAnonymisedCorpus({
    captureFiles: [ctx.capture],
    outDir: join(ctx.dir, 'existing'),
    env: { PATH: process.env['PATH'] },
    salt: 'salt',
    stagingRoot: ctx.dir,
  });

  expect(written).rejects.toThrowWithMessage(
    Error,
    `Refusing to write into ${join(ctx.dir, 'existing')}: it already exists.`,
  );
});

test('it writes nothing when the secret scan cannot run', async () => {
  const ctx = await setupTest();

  await writeFile(ctx.capture, '');

  const written = writeAnonymisedCorpus({
    captureFiles: [ctx.capture],
    outDir: join(ctx.dir, 'recorded-traffic'),
    env: { PATH: ctx.dir },
    salt: 'salt',
    stagingRoot: ctx.dir,
  });

  expect(written).rejects.toThrow(/secret scan did not pass/);

  const out = await stat(join(ctx.dir, 'recorded-traffic')).catch(() => null);
  const entries = await readdir(ctx.dir);

  expect(out).toBeNull();
  expect(entries).toStrictEqual(['requests-2026-10-10.jsonl']);
});

test('it refuses to stage the corpus inside a git work tree', async () => {
  const ctx = await setupTest();

  runGit(ctx.dir, ['init', '-q', '-b', 'main', join(ctx.dir, 'staging')]);

  await writeFile(ctx.capture, '');

  const written = writeAnonymisedCorpus({
    captureFiles: [ctx.capture],
    outDir: join(ctx.dir, 'recorded-traffic'),
    env: { PATH: process.env['PATH'] },
    salt: 'salt',
    stagingRoot: join(ctx.dir, 'staging'),
  });

  expect(written).rejects.toThrowWithMessage(
    Error,
    `Refusing to stage the corpus in ${join(ctx.dir, 'staging')}: it is inside the git work tree ${join(ctx.dir, 'staging')}.`,
  );
});
