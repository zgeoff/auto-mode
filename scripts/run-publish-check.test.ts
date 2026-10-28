import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildStubProgram } from '../test-utils/build-stub-program.ts';
import { runPublishCheck } from './run-publish-check.ts';

async function setupTest(): Promise<{ readonly directory: string }> {
  const directory = await mkdtemp(join(tmpdir(), 'publish-check-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return { directory };
}

test('it publishes the checked-out version when npm lacks it and its release tag exists', async () => {
  const ctx = await setupTest();

  await writeFile(
    join(ctx.directory, 'package.json'),
    JSON.stringify({ name: 'widget', version: '2.4.0' }),
  );

  const program = buildStubProgram({
    'npm view widget@2.4.0 version --json': [
      { exitCode: 1, stdout: '{"error":{"code":"E404"}}', stderr: 'npm error code E404' },
    ],
    'git ls-remote --exit-code --tags origin refs/tags/widget-v2.4.0': [
      { exitCode: 0, stdout: 'f00d\trefs/tags/widget-v2.4.0\n', stderr: '' },
    ],
  });

  const action = runPublishCheck({ cwd: ctx.directory, env: {}, runProgram: program });

  expect(action).toStrictEqual({
    kind: 'publish',
    reason: 'widget@2.4.0 is tagged widget-v2.4.0 and missing from npm',
  });
});

test('it throws on a package.json that has no version', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.directory, 'package.json'), JSON.stringify({ name: 'widget' }));

  const program = buildStubProgram({});

  expect(() => runPublishCheck({ cwd: ctx.directory, env: {}, runProgram: program })).toThrow();
});
