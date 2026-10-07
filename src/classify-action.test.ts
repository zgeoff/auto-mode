import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createMockActionRequest } from '../test-utils/factories/create-mock-action-request.ts';
import { classifyAction } from './classify-action.ts';
import { DEFAULT_CONFIG } from './config/config.ts';

async function setupTest(): Promise<{ readonly settings: string }> {
  const dir = await mkdtemp(join(tmpdir(), 'auto-mode-classify-action-'));

  onTestFinished(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  const settings = join(dir, 'settings.json');

  await writeFile(settings, '{}');

  return { settings };
}

test('it allows a read-only tool in the local tier', async () => {
  const ctx = await setupTest();

  const outcome = await classifyAction(
    createMockActionRequest({ toolName: 'Read', toolInput: { file_path: '/repo/a.ts' } }),
    { ...DEFAULT_CONFIG, claudeSettingsPath: ctx.settings },
  );

  expect(outcome).toStrictEqual({
    verdict: { kind: 'allow' },
    note: 'allowed by Read-only actions (local)',
    status: 'allow',
  });
});

test('it gives no verdict for an escalated action when the model tier is skipped', async () => {
  const ctx = await setupTest();

  const outcome = await classifyAction(
    createMockActionRequest({ toolName: 'Write', toolInput: { file_path: '/repo/a.ts' } }),
    { ...DEFAULT_CONFIG, claudeSettingsPath: ctx.settings },
    { localOnly: true },
  );

  expect(outcome).toStrictEqual({
    verdict: null,
    note: 'Write needs the model tier, which this run skipped',
    status: 'skipped',
  });
});

test('it sends a local allowance to the model tier when configured deny rules exist', async () => {
  const ctx = await setupTest();

  await writeFile(
    ctx.settings,
    JSON.stringify({ autoMode: { hard_deny: ['Never read the private key'] } }),
  );

  const outcome = await classifyAction(
    createMockActionRequest({ toolName: 'Read', toolInput: { file_path: '/repo/key.pem' } }),
    { ...DEFAULT_CONFIG, claudeSettingsPath: ctx.settings },
    { localOnly: true },
  );

  expect(outcome.status).toBe('skipped');
});

test('it fails closed on unreadable Claude settings when configured to deny', async () => {
  const ctx = await setupTest();

  await writeFile(ctx.settings, 'not json {');

  const outcome = await classifyAction(
    createMockActionRequest({ toolName: 'Read', toolInput: { file_path: '/repo/a.ts' } }),
    { ...DEFAULT_CONFIG, claudeSettingsPath: ctx.settings, onFailure: 'deny' },
  );

  expect(outcome).toStrictEqual({
    verdict: { kind: 'deny', rule: 'Classifier Unavailable', reason: 'Claude settings unreadable' },
    note: 'Claude settings unreadable; classifier unavailable',
    status: 'failure',
    unavailable: true,
  });
});
