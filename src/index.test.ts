import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildMockActionRequest } from '../test-utils/factories/build-mock-action-request.ts';
import { buildMockConfig } from '../test-utils/factories/build-mock-config.ts';
import { buildMockRuntime } from '../test-utils/factories/build-mock-runtime.ts';
import { DEFAULT_CONFIG } from './config/config.ts';
import { classifyAction, loadConfig } from './index.ts';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'auto-mode-index-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return { directory };
}

// The package exports this set, so removing, renaming, or retyping one is a
// breaking change for a consumer that publint and the type build cannot see.
test('it exports the documented public API', async () => {
  expect({ ...(await import('./index.ts')) }).toStrictEqual({
    classifyAction: expect.toBeFunction(),
    loadConfig: expect.toBeFunction(),
    parseActionRequest: expect.toBeFunction(),
  });
});

test('#classifyAction classifies with the runtime a library caller passes and no stderr', async () => {
  const ctx = await setupTest();

  const outcome = await classifyAction(
    buildMockActionRequest({
      cwd: ctx.directory,
      toolName: 'Read',
      toolInput: { file_path: join(ctx.directory, 'a.ts') },
    }),
    buildMockConfig({ judge: null, claudeSettingsPath: null }),
    { runtime: buildMockRuntime({ env: {}, home: ctx.directory, scratchPaths: [] }) },
  );

  expect(outcome).toStrictEqual({
    verdict: { kind: 'allow' },
    decidingStage: 'local',
    note: 'allowed by Read-only actions (local)',
    status: 'allow',
  });
});

test('#loadConfig reads the shipped defaults for a config file that does not exist', async () => {
  const ctx = await setupTest();
  const config = await loadConfig(join(ctx.directory, 'missing.json'));

  expect(config).toBe(DEFAULT_CONFIG);
});
