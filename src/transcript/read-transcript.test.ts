import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readTranscript } from './read-transcript.ts';

async function setupTest(): Promise<{ readonly transcriptPath: string }> {
  const dir = await mkdtemp(join(tmpdir(), 'auto-mode-transcript-'));

  onTestFinished(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  return { transcriptPath: join(dir, 'transcript.jsonl') };
}

test('it reports no entries when the harness named no transcript', async () => {
  const actual = await readTranscript(undefined, 40);

  expect(actual).toBeEmpty();
});

test('it reports no entries when the file does not exist', async () => {
  const actual = await readTranscript('/nowhere/transcript.jsonl', 40);

  expect(actual).toBeEmpty();
});

test('it reports no entries when the caller asks for none', async () => {
  const ctx = await setupTest();

  await writeFile(ctx.transcriptPath, JSON.stringify({ role: 'user', content: 'hello' }));

  const actual = await readTranscript(ctx.transcriptPath, 0);

  expect(actual).toBeEmpty();
});

test('it reads a row that carries its role and text at the top level', async () => {
  const ctx = await setupTest();

  await writeFile(ctx.transcriptPath, JSON.stringify({ role: 'user', content: 'clean the repo' }));

  const entries = await readTranscript(ctx.transcriptPath, 40);

  expect(entries).toStrictEqual([{ role: 'user', text: 'clean the repo' }]);
});

// Claude nests the turn under message and names the row type separately.
test('it prefers the nested message over the row when both carry a role', async () => {
  const ctx = await setupTest();

  await writeFile(
    ctx.transcriptPath,
    JSON.stringify({ type: 'assistant', message: { role: 'assistant', content: 'on it' } }),
  );

  const entries = await readTranscript(ctx.transcriptPath, 40);

  expect(entries).toStrictEqual([{ role: 'assistant', text: 'on it' }]);
});

test('it falls back to the row type when nothing names a role', async () => {
  const ctx = await setupTest();

  await writeFile(ctx.transcriptPath, JSON.stringify({ type: 'user', content: 'hello' }));

  const entries = await readTranscript(ctx.transcriptPath, 40);

  expect(entries).toStrictEqual([{ role: 'user', text: 'hello' }]);
});

test('it joins the text blocks of a content array', async () => {
  const ctx = await setupTest();

  await writeFile(
    ctx.transcriptPath,
    JSON.stringify({ role: 'assistant', content: [{ text: 'first' }, { text: 'second' }] }),
  );

  const entries = await readTranscript(ctx.transcriptPath, 40);

  expect(entries).toStrictEqual([{ role: 'assistant', text: 'first\nsecond' }]);
});

// A tool call is the most important thing in a transcript for this job, so it
// is rendered rather than dropped.
test('it renders a tool call with its name and input', async () => {
  const ctx = await setupTest();

  await writeFile(
    ctx.transcriptPath,
    JSON.stringify({
      role: 'assistant',
      content: [{ type: 'tool_use', name: 'Bash', input: { command: 'ls' } }],
    }),
  );

  const entries = await readTranscript(ctx.transcriptPath, 40);

  expect(entries).toStrictEqual([{ role: 'assistant', text: '[tool Bash] {"command":"ls"}' }]);
});

test('it drops a content block it cannot read rather than the whole row', async () => {
  const ctx = await setupTest();

  await writeFile(
    ctx.transcriptPath,
    JSON.stringify({ role: 'assistant', content: [{ type: 'thinking' }, { text: 'the answer' }] }),
  );

  const entries = await readTranscript(ctx.transcriptPath, 40);

  expect(entries).toStrictEqual([{ role: 'assistant', text: 'the answer' }]);
});

test('it drops a row with a role and no text', async () => {
  const ctx = await setupTest();

  await writeFile(ctx.transcriptPath, JSON.stringify({ role: 'user', content: '   ' }));

  const actual = await readTranscript(ctx.transcriptPath, 40);

  expect(actual).toBeEmpty();
});

test('it drops a row that names no role', async () => {
  const ctx = await setupTest();

  await writeFile(ctx.transcriptPath, JSON.stringify({ content: 'orphan text' }));

  const actual = await readTranscript(ctx.transcriptPath, 40);

  expect(actual).toBeEmpty();
});

// A harness may be mid-write, so a partial last line is normal.
test('it skips a line that is not JSON and keeps the rest', async () => {
  const ctx = await setupTest();

  await writeFile(
    ctx.transcriptPath,
    [
      JSON.stringify({ role: 'user', text: 'first' }),
      'partial {',
      '',
      JSON.stringify({ role: 'user', text: 'second' }),
    ].join('\n'),
  );

  const entries = await readTranscript(ctx.transcriptPath, 40);

  expect(entries).toStrictEqual([
    { role: 'user', text: 'first' },
    { role: 'user', text: 'second' },
  ]);
});

// Only the tail, and always the same tail for a given length, so the cached
// prompt prefix grows by appending rather than sliding.
test('it keeps the newest entries when the transcript is longer than the limit', async () => {
  const ctx = await setupTest();

  const rows = Array.from({ length: 5 }, (_unused, index) =>
    JSON.stringify({ role: 'user', text: `turn ${index}` }),
  );

  await writeFile(ctx.transcriptPath, rows.join('\n'));

  const entries = await readTranscript(ctx.transcriptPath, 2);

  expect(entries).toStrictEqual([
    { role: 'user', text: 'turn 3' },
    { role: 'user', text: 'turn 4' },
  ]);
});

test('it truncates an entry that is very long', async () => {
  const ctx = await setupTest();

  await writeFile(ctx.transcriptPath, JSON.stringify({ role: 'user', text: 'x'.repeat(10_000) }));

  const entries = await readTranscript(ctx.transcriptPath, 40);

  expect(entries[0]?.text).toHaveLength(2000);
});
