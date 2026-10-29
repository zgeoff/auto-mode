import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildMockActionRequest } from '../../test-utils/factories/build-mock-action-request.ts';
import { buildMockRuntime } from '../../test-utils/factories/build-mock-runtime.ts';
import { resolveOpeningPrompt } from './resolve-opening-prompt.ts';

async function setupTest(): Promise<{ readonly directory: string }> {
  const directory = await mkdtemp(join(tmpdir(), 'opening-prompt-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return { directory };
}

test('it drops the opening prompt from the request when the launcher names a spawner', async () => {
  const ctx = await setupTest();

  const scopeFilePath = join(ctx.directory, 'scope.json');

  await writeFile(
    scopeFilePath,
    JSON.stringify({
      format: 'auto-mode.scope',
      version: 1,
      replyChannels: [
        { tool: 'mcp__atc__atc_message_send', field: 'session', recipient: 's-lead' },
      ],
    }),
  );

  const request = buildMockActionRequest({
    decisionContext: {
      agentID: null,
      originalUserTask: { text: 'Draft the changelog entry.', origin: 'composer' },
      lastDirectUserMessage: {
        text: 'Draft the changelog entry.',
        origin: 'composer',
        position: 'opening',
      },
    },
  });

  const resolved = await resolveOpeningPrompt(
    request,
    buildMockRuntime({ env: { AUTO_MODE_SCOPE_FILE: scopeFilePath } }),
  );

  expect(resolved.decisionContext?.lastDirectUserMessage).toBeNull();

  expect(resolved.decisionContext?.originalUserTask).toStrictEqual({
    text: 'Draft the changelog entry.',
    origin: 'composer',
  });
});

test('it keeps the opening prompt without its mark when no launcher names a spawner', async () => {
  const request = buildMockActionRequest({
    decisionContext: {
      agentID: null,
      lastDirectUserMessage: {
        text: 'Draft the changelog entry.',
        origin: 'composer',
        position: 'opening',
      },
    },
  });

  const resolved = await resolveOpeningPrompt(request, buildMockRuntime());

  expect(resolved.decisionContext?.lastDirectUserMessage).toStrictEqual({
    text: 'Draft the changelog entry.',
    origin: 'composer',
  });
});

test('it leaves a request whose message is not the opening prompt unchanged', async () => {
  const request = buildMockActionRequest({
    decisionContext: {
      agentID: null,
      lastDirectUserMessage: { text: 'Push the changelog branch.', origin: 'composer' },
    },
  });

  const resolved = await resolveOpeningPrompt(
    request,
    buildMockRuntime({ env: { AUTO_MODE_SCOPE_FILE: '/srv/unread/scope.json' } }),
  );

  expect(resolved).toBe(request);
});
