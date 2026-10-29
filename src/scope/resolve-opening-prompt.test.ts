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

test('it turns the opening prompt into the delegated task when the launcher names a spawner', async () => {
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
      originalUserTask: {
        text: 'Draft the changelog entry.',
        origin: 'composer',
        position: 'opening',
      },
      delegatedTask: null,
      lastDirectUserMessage: {
        text: 'Draft the changelog entry.',
        origin: 'composer',
        position: 'opening',
      },
      omittedTaskContext: [],
    },
  });

  const resolved = await resolveOpeningPrompt(
    request,
    buildMockRuntime({ env: { AUTO_MODE_SCOPE_FILE: scopeFilePath } }),
  );

  expect(resolved.decisionContext).toStrictEqual({
    agentID: null,
    originalUserTask: null,
    delegatedTask: { text: 'Draft the changelog entry.', origin: 'agent.spawn' },
    lastDirectUserMessage: null,
    omittedTaskContext: [{ field: 'originalUserTask', reason: 'unavailable' }],
  });
});

test('it keeps a typed message and moves the opening task to the delegated task when the launcher names a spawner', async () => {
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
      originalUserTask: {
        text: 'Draft the changelog entry.',
        origin: 'composer',
        position: 'opening',
      },
      delegatedTask: null,
      lastDirectUserMessage: { text: 'Post the entry to the docs channel.', origin: 'composer' },
      omittedTaskContext: [],
    },
  });

  const resolved = await resolveOpeningPrompt(
    request,
    buildMockRuntime({ env: { AUTO_MODE_SCOPE_FILE: scopeFilePath } }),
  );

  expect(resolved.decisionContext).toStrictEqual({
    agentID: null,
    originalUserTask: null,
    delegatedTask: { text: 'Draft the changelog entry.', origin: 'agent.spawn' },
    lastDirectUserMessage: { text: 'Post the entry to the docs channel.', origin: 'composer' },
    omittedTaskContext: [{ field: 'originalUserTask', reason: 'unavailable' }],
  });
});

test('it gives a subagent without a delegated task none of the opening prompt when the launcher names a spawner', async () => {
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
      agentID: 'agent-7',
      originalUserTask: {
        text: 'Draft the changelog entry.',
        origin: 'composer',
        position: 'opening',
      },
      delegatedTask: null,
      lastDirectUserMessage: null,
      omittedTaskContext: [{ field: 'delegatedTask', reason: 'unavailable' }],
    },
  });

  const resolved = await resolveOpeningPrompt(
    request,
    buildMockRuntime({ env: { AUTO_MODE_SCOPE_FILE: scopeFilePath } }),
  );

  expect(resolved.decisionContext).toStrictEqual({
    agentID: 'agent-7',
    originalUserTask: null,
    delegatedTask: null,
    lastDirectUserMessage: null,
    omittedTaskContext: [
      { field: 'delegatedTask', reason: 'unavailable' },
      { field: 'originalUserTask', reason: 'unavailable' },
    ],
  });
});

test('it drops a stale opening prompt from the request when the launcher names a spawner', async () => {
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
      lastDirectUserMessage: {
        text: 'Leave the release branch alone.',
        origin: 'composer',
        freshness: 'stale',
        position: 'opening',
      },
    },
  });

  const resolved = await resolveOpeningPrompt(
    request,
    buildMockRuntime({ env: { AUTO_MODE_SCOPE_FILE: scopeFilePath } }),
  );

  expect(resolved.decisionContext?.lastDirectUserMessage).toBeNull();
});

test('it keeps the opening prompt as the task and the message without their marks when no launcher names a spawner', async () => {
  const request = buildMockActionRequest({
    decisionContext: {
      agentID: null,
      originalUserTask: {
        text: 'Draft the changelog entry.',
        origin: 'composer',
        position: 'opening',
      },
      delegatedTask: null,
      lastDirectUserMessage: {
        text: 'Draft the changelog entry.',
        origin: 'composer',
        position: 'opening',
      },
      omittedTaskContext: [],
    },
  });

  const resolved = await resolveOpeningPrompt(request, buildMockRuntime());

  expect(resolved.decisionContext).toStrictEqual({
    agentID: null,
    originalUserTask: { text: 'Draft the changelog entry.', origin: 'composer' },
    delegatedTask: null,
    lastDirectUserMessage: { text: 'Draft the changelog entry.', origin: 'composer' },
    omittedTaskContext: [],
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
