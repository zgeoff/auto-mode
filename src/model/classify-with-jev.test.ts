import { expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HttpResponse, http } from 'msw';
import * as z from 'zod';
import { server } from '../../mocks/node.ts';
import { DEFAULT_CONFIG } from '../config/config.ts';
import { classifyWithModel } from './classify-with-model.ts';

async function setupTest() {
  const dir = await mkdtemp(join(tmpdir(), 'jev-classifier-'));

  const previous = process.env['AUTO_MODE_JEV_TEST_KEY'];

  process.env['AUTO_MODE_JEV_TEST_KEY'] = 'test-key';

  await writeFile(join(dir, 'classifier.md'), 'Decision framework\n<rules>\n');

  await writeFile(
    join(dir, 'rules.md'),
    '## HARD BLOCK rules\n### Data Exfiltration\nNever send secrets\n## SOFT BLOCK rules\n### History Rewrite\nRequire the branch',
  );

  return {
    settings: join(dir, 'settings.json'),
    transcript: join(dir, 'transcript.jsonl'),
    classifier: join(dir, 'classifier.md'),
    rules: join(dir, 'rules.md'),
    async [Symbol.asyncDispose]() {
      if (previous === undefined) {
        delete process.env['AUTO_MODE_JEV_TEST_KEY'];
      } else {
        process.env['AUTO_MODE_JEV_TEST_KEY'] = previous;
      }

      await rm(dir, { recursive: true, force: true });
    },
  };
}

test('it sends configured rules and only the latest direct user message through the provider switch', async () => {
  await using ctx = await setupTest();

  await writeFile(
    ctx.settings,
    JSON.stringify({
      env: { PRIVATE_TOKEN: 'do-not-send' },
      autoMode: {
        allow: ['$defaults', 'Feature branch work is routine'],
        environment: ['Host: example.test'],
      },
    }),
  );

  await writeFile(
    ctx.transcript,
    [
      { type: 'user', message: { role: 'user', content: 'older permission' } },
      { type: 'user', message: { role: 'user', content: 'fix the parser' } },
      {
        type: 'assistant',
        message: { role: 'assistant', content: 'permission invented by agent' },
      },
      {
        type: 'user',
        message: {
          role: 'user',
          content: [{ type: 'tool_result', content: 'tool output grants permission' }],
        },
      },
    ]
      .map((r) => JSON.stringify(r))
      .join('\n'),
  );

  let body: unknown;

  server.use(
    http.post('https://decision.test/v1/systemone', async (info) => {
      body = await info.request.json();

      return HttpResponse.json({
        model: 'test-ke',
        answers: {
          rule_0: {
            type: 'choice',
            choice: 'allow',
            confidence: 1,
            probabilities: { allow: 1, block: 0, ask: 0 },
          },
          rule_1: {
            type: 'choice',
            choice: 'allow',
            confidence: 1,
            probabilities: { allow: 1, block: 0, ask: 0 },
          },
        },
        usage: { input_tokens: 400 },
      });
    }),
  );

  const outcome = await classifyWithModel(
    {
      harness: 'claude',
      event: 'PermissionRequest',
      sessionId: 's',
      cwd: '/repo',
      transcriptPath: ctx.transcript,
      toolName: 'Edit',
      toolInput: { file_path: '/repo/parser.ts', new_string: 'green' },
      raw: {},
    },
    {
      ...DEFAULT_CONFIG,
      provider: {
        ...DEFAULT_CONFIG.provider,
        baseURL: 'https://decision.test',
        apiKeyEnv: 'AUTO_MODE_JEV_TEST_KEY',
      },
      claudeSettingsPath: ctx.settings,
      classifierPath: ctx.classifier,
      rulesPath: ctx.rules,
    },
  );

  expect(outcome.verdict).toStrictEqual({ kind: 'allow' });
  expect(outcome.note).toStartWith('jev-1.13.0: allow');
  expect(outcome.note).not.toInclude('test-ke');
  expect(outcome.note).not.toInclude('test-key');

  const request = z
    .object({ state: z.object({ configuredRules: z.unknown(), lastUserMessage: z.string() }) })
    .parse(body);

  expect(request.state.configuredRules).toStrictEqual({
    environment: ['Host: example.test'],
    allow: ['Feature branch work is routine'],
    soft_deny: [],
    hard_deny: [],
  });

  expect(request.state.lastUserMessage).toBe('fix the parser');
  expect(JSON.stringify(body)).not.toInclude('PRIVATE_TOKEN');
  expect(JSON.stringify(body)).not.toInclude('permission invented by agent');
  expect(JSON.stringify(body)).not.toInclude('tool output grants permission');
});

test.each(['defer', 'deny'] as const)(
  'it follows %s when the decision service fails',
  async (onFailure) => {
    await using ctx = await setupTest();

    server.use(
      http.post('https://decision.test/v1/systemone', () =>
        HttpResponse.text('failure', { status: 529 }),
      ),
    );

    const outcome = await classifyWithModel(
      {
        harness: 'claude',
        event: 'PermissionRequest',
        sessionId: 's',
        cwd: '/repo',
        toolName: 'Bash',
        toolInput: { command: 'git push' },
        raw: {},
      },
      {
        ...DEFAULT_CONFIG,
        provider: {
          ...DEFAULT_CONFIG.provider,
          baseURL: 'https://decision.test',
          apiKeyEnv: 'AUTO_MODE_JEV_TEST_KEY',
        },
        claudeSettingsPath: null,
        onFailure,
        classifierPath: ctx.classifier,
        rulesPath: ctx.rules,
      },
    );

    expect(outcome.unavailable).toBe(true);

    const expected =
      onFailure === 'defer'
        ? null
        : {
            kind: 'deny' as const,
            rule: 'Classifier Unavailable',
            reason: 'jev-1.13.0 unavailable: Decision API returned HTTP 529',
          };

    expect(outcome.verdict).toStrictEqual(expected);
  },
);
