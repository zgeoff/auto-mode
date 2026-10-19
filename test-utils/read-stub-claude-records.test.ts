import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readStubClaudeRecords } from './read-stub-claude-records.ts';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'auto-mode-stub-claude-records-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return { recordPath: join(directory, 'calls.jsonl') };
}

test('it reads each recorded review in the order the stub wrote them', async () => {
  const ctx = await setupTest();

  await writeFile(
    ctx.recordPath,
    `${JSON.stringify({
      pid: 41,
      review: 1,
      clears: 0,
      cwd: '/work',
      argv: ['--model=claude-haiku-5-5'],
      system: ['the policy'],
      user: 'the first evidence',
      env: { ANTHROPIC_BASE_URL: 'https://gateway.example' },
    })}\n${JSON.stringify({
      pid: 41,
      review: 2,
      clears: 1,
      cwd: '/work',
      argv: [],
      system: null,
      user: 'the second evidence',
      env: {},
    })}\n`,
  );

  const records = await readStubClaudeRecords(ctx.recordPath);

  expect(records).toStrictEqual([
    {
      pid: 41,
      review: 1,
      clears: 0,
      cwd: '/work',
      argv: ['--model=claude-haiku-5-5'],
      system: ['the policy'],
      user: 'the first evidence',
      env: { ANTHROPIC_BASE_URL: 'https://gateway.example' },
    },
    {
      pid: 41,
      review: 2,
      clears: 1,
      cwd: '/work',
      argv: [],
      system: null,
      user: 'the second evidence',
      env: {},
    },
  ]);
});

test('it rejects a recorded review without a process ID', async () => {
  const ctx = await setupTest();

  await writeFile(
    ctx.recordPath,
    `${JSON.stringify({
      review: 1,
      clears: 0,
      cwd: '/work',
      argv: [],
      system: null,
      user: 'the evidence',
      env: {},
    })}\n`,
  );

  expect(readStubClaudeRecords(ctx.recordPath)).rejects.toMatchObject({
    issues: [expect.objectContaining({ path: ['pid'] })],
  });
});
