import { expect, onTestFinished, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStubClaude } from './create-stub-claude.ts';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'auto-mode-create-stub-claude-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return { directory };
}

test('it puts a claude on a bin folder that answers a user turn with the stub reply', async () => {
  const ctx = await setupTest();
  const binDir = await createStubClaude(ctx.directory);

  const result = spawnSync('claude', [], {
    input: JSON.stringify({ type: 'user', message: { role: 'user', content: 'the evidence' } }),
    encoding: 'utf8',
    env: { PATH: binDir, STUB_CLAUDE_REPLY: '{"verdict":"confirm"}' },
  });

  const [, reply] = result.stdout.trim().split('\n');

  expect({ binDir, status: result.status }).toStrictEqual({
    binDir: join(ctx.directory, 'bin'),
    status: 0,
  });

  expect(JSON.parse(reply ?? '')).toMatchObject({
    type: 'result',
    result: '{"verdict":"confirm"}',
  });
});
