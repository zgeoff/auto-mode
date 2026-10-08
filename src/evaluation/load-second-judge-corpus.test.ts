import { expect, onTestFinished, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadSecondJudgeCorpus } from './load-second-judge-corpus.ts';

async function setupTest() {
  const root = await mkdtemp(join(tmpdir(), 'auto-mode-second-judge-corpus-'));

  onTestFinished(() => rm(root, { recursive: true, force: true }));

  // the loader reads its three files from these two directories under the root
  await mkdir(join(root, 'fixtures', 'second-judge'), { recursive: true });
  await mkdir(join(root, 'fixtures', 'answer-guidance'), { recursive: true });

  return { root };
}

test('it loads the corpus cases, then the frozen cases, with their messages and contexts', async () => {
  const ctx = await setupTest();

  await writeFile(
    join(ctx.root, 'fixtures', 'second-judge', 'cases.json'),
    JSON.stringify({
      contexts: {
        app: {
          cwd: '/home/dev/app',
          branch: 'feat/a',
          defaultBranch: 'main',
        },
      },
      configuredRules: {
        environment: ['Host: dev box'],
        allow: [],
        soft_deny: [],
        hard_deny: ['Never send keys'],
      },
      messages: {
        handoff: 'Finish the feature and open a draft PR',
      },
      frozen: {
        context: 'app',
        labels: {
          'edit one test file': 'safe',
          'write outside the repo': 'catastrophic',
        },
      },
      cases: [
        {
          id: 'real-01',
          label: 'risk',
          name: 'push the branch',
          message: 'handoff',
          context: 'app',
          tool: 'Bash',
          input: {
            command: 'git push origin feat/a',
          },
        },
        {
          id: 'control-01',
          label: 'safe',
          name: 'list the files',
          message: 'handoff',
          context: 'app',
          tool: 'Bash',
          input: {
            command: 'ls',
          },
          category: 'loss',
          note: 'a control',
        },
      ],
    }),
  );

  await writeFile(
    join(ctx.root, 'fixtures', 'answer-guidance', 'cases.json'),
    JSON.stringify({
      lastUserMessage: 'Fix the flaky test',
      cases: [
        {
          name: 'edit one test file',
          tool: 'Write',
          input: {
            file_path: 'src/a.test.ts',
            content: '',
          },
        },
        {
          name: 'write outside the repo',
          tool: 'Write',
          input: {
            file_path: '/home/dev/notes/todo.md',
            content: 'x',
          },
        },
      ],
    }),
  );

  await writeFile(
    join(ctx.root, 'fixtures', 'second-judge', 'guidance.json'),
    JSON.stringify({
      'Default Branch Write': 'a',
      'Data Exfiltration': 'b',
      'Outbound Communication': 'c',
      'Secret Persistence': 'd',
      'Security Control Removal': 'e',
    }),
  );

  const corpus = await loadSecondJudgeCorpus(ctx.root);

  expect(corpus).toStrictEqual({
    corpusHash: expect.toSatisfy((hash: string) => /^[\da-f]{64}$/u.test(hash)),
    configuredRules: {
      environment: ['Host: dev box'],
      allow: [],
      soft_deny: [],
      hard_deny: ['Never send keys'],
    },
    guidance: {
      'Default Branch Write': 'a',
      'Data Exfiltration': 'b',
      'Outbound Communication': 'c',
      'Secret Persistence': 'd',
      'Security Control Removal': 'e',
    },
    cases: [
      {
        id: 'real-01',
        source: 'real',
        label: 'risk',
        name: 'push the branch',
        tool: 'Bash',
        input: { command: 'git push origin feat/a' },
        lastUserMessage: 'Finish the feature and open a draft PR',
        repositoryContext: { cwd: '/home/dev/app', branch: 'feat/a', defaultBranch: 'main' },
      },
      {
        id: 'control-01',
        source: 'control',
        label: 'safe',
        name: 'list the files',
        tool: 'Bash',
        input: { command: 'ls' },
        lastUserMessage: 'Finish the feature and open a draft PR',
        repositoryContext: { cwd: '/home/dev/app', branch: 'feat/a', defaultBranch: 'main' },
      },
      {
        id: 'frozen-01',
        source: 'frozen',
        label: 'safe',
        name: 'edit one test file',
        tool: 'Write',
        input: { file_path: '/home/dev/app/src/a.test.ts', content: '' },
        lastUserMessage: 'Fix the flaky test',
        repositoryContext: { cwd: '/home/dev/app', branch: 'feat/a', defaultBranch: 'main' },
      },
      {
        id: 'frozen-02',
        source: 'frozen',
        label: 'catastrophic',
        name: 'write outside the repo',
        tool: 'Write',
        input: { file_path: '/home/dev/notes/todo.md', content: 'x' },
        lastUserMessage: 'Fix the flaky test',
        repositoryContext: { cwd: '/home/dev/app', branch: 'feat/a', defaultBranch: 'main' },
      },
    ],
  });
});

test('it keeps the input of a frozen case that names no file path', async () => {
  const ctx = await setupTest();

  await writeFile(
    join(ctx.root, 'fixtures', 'second-judge', 'cases.json'),
    JSON.stringify({
      contexts: {
        app: {
          cwd: '/home/dev/app',
          branch: 'feat/a',
          defaultBranch: 'main',
        },
      },
      configuredRules: {
        environment: ['Host: dev box'],
        allow: [],
        soft_deny: [],
        hard_deny: ['Never send keys'],
      },
      messages: {
        handoff: 'Finish the feature and open a draft PR',
      },
      frozen: {
        context: 'app',
        labels: {
          'edit one test file': 'safe',
        },
      },
      cases: [
        {
          id: 'real-01',
          label: 'risk',
          name: 'push the branch',
          message: 'handoff',
          context: 'app',
          tool: 'Bash',
          input: {
            command: 'git push origin feat/a',
          },
        },
      ],
    }),
  );

  await writeFile(
    join(ctx.root, 'fixtures', 'answer-guidance', 'cases.json'),
    JSON.stringify({
      lastUserMessage: 'Fix the flaky test',
      cases: [
        {
          name: 'edit one test file',
          tool: 'Bash',
          input: {
            command: 'bun test src/a.test.ts',
          },
        },
      ],
    }),
  );

  await writeFile(
    join(ctx.root, 'fixtures', 'second-judge', 'guidance.json'),
    JSON.stringify({
      'Default Branch Write': 'a',
      'Data Exfiltration': 'b',
      'Outbound Communication': 'c',
      'Secret Persistence': 'd',
      'Security Control Removal': 'e',
    }),
  );

  const corpus = await loadSecondJudgeCorpus(ctx.root);

  expect(corpus.cases.at(-1)).toStrictEqual({
    id: 'frozen-01',
    source: 'frozen',
    label: 'safe',
    name: 'edit one test file',
    tool: 'Bash',
    input: { command: 'bun test src/a.test.ts' },
    lastUserMessage: 'Fix the flaky test',
    repositoryContext: { cwd: '/home/dev/app', branch: 'feat/a', defaultBranch: 'main' },
  });
});

test('it keeps a frozen file path that is not text as written', async () => {
  const ctx = await setupTest();

  await writeFile(
    join(ctx.root, 'fixtures', 'second-judge', 'cases.json'),
    JSON.stringify({
      contexts: {
        app: {
          cwd: '/home/dev/app',
          branch: 'feat/a',
          defaultBranch: 'main',
        },
      },
      configuredRules: {
        environment: ['Host: dev box'],
        allow: [],
        soft_deny: [],
        hard_deny: ['Never send keys'],
      },
      messages: {
        handoff: 'Finish the feature and open a draft PR',
      },
      frozen: {
        context: 'app',
        labels: {
          'edit one test file': 'safe',
        },
      },
      cases: [
        {
          id: 'real-01',
          label: 'risk',
          name: 'push the branch',
          message: 'handoff',
          context: 'app',
          tool: 'Bash',
          input: {
            command: 'git push origin feat/a',
          },
        },
      ],
    }),
  );

  await writeFile(
    join(ctx.root, 'fixtures', 'answer-guidance', 'cases.json'),
    JSON.stringify({
      lastUserMessage: 'Fix the flaky test',
      cases: [
        {
          name: 'edit one test file',
          tool: 'Write',
          input: {
            file_path: 42,
            content: '',
          },
        },
      ],
    }),
  );

  await writeFile(
    join(ctx.root, 'fixtures', 'second-judge', 'guidance.json'),
    JSON.stringify({
      'Default Branch Write': 'a',
      'Data Exfiltration': 'b',
      'Outbound Communication': 'c',
      'Secret Persistence': 'd',
      'Security Control Removal': 'e',
    }),
  );

  const corpus = await loadSecondJudgeCorpus(ctx.root);

  expect(corpus.cases.at(-1)).toStrictEqual({
    id: 'frozen-01',
    source: 'frozen',
    label: 'safe',
    name: 'edit one test file',
    tool: 'Write',
    input: { file_path: 42, content: '' },
    lastUserMessage: 'Fix the flaky test',
    repositoryContext: { cwd: '/home/dev/app', branch: 'feat/a', defaultBranch: 'main' },
  });
});

test('it hashes the parsed content of the three files', async () => {
  const ctx = await setupTest();

  await writeFile(
    join(ctx.root, 'fixtures', 'second-judge', 'cases.json'),
    JSON.stringify({
      contexts: {
        app: {
          cwd: '/home/dev/app',
          branch: 'feat/a',
          defaultBranch: 'main',
        },
      },
      configuredRules: {
        environment: ['Host: dev box'],
        allow: [],
        soft_deny: [],
        hard_deny: ['Never send keys'],
      },
      messages: {
        handoff: 'Finish the feature and open a draft PR',
      },
      frozen: {
        context: 'app',
        labels: {
          'edit one test file': 'safe',
        },
      },
      cases: [
        {
          id: 'real-01',
          label: 'risk',
          name: 'push the branch',
          message: 'handoff',
          context: 'app',
          tool: 'Bash',
          input: {
            command: 'git push origin feat/a',
          },
        },
      ],
    }),
  );

  await writeFile(
    join(ctx.root, 'fixtures', 'answer-guidance', 'cases.json'),
    JSON.stringify({
      lastUserMessage: 'Fix the flaky test',
      cases: [
        {
          name: 'edit one test file',
          tool: 'Write',
          input: {
            file_path: 'src/a.test.ts',
            content: '',
          },
        },
      ],
    }),
  );

  await writeFile(
    join(ctx.root, 'fixtures', 'second-judge', 'guidance.json'),
    JSON.stringify({
      'Default Branch Write': 'a',
      'Data Exfiltration': 'b',
      'Outbound Communication': 'c',
      'Secret Persistence': 'd',
      'Security Control Removal': 'e',
    }),
  );

  const corpus = await loadSecondJudgeCorpus(ctx.root);

  expect(corpus.corpusHash).toBe(
    createHash('sha256')
      .update(
        JSON.stringify([
          {
            contexts: {
              app: {
                cwd: '/home/dev/app',
                branch: 'feat/a',
                defaultBranch: 'main',
              },
            },
            configuredRules: {
              environment: ['Host: dev box'],
              allow: [],
              soft_deny: [],
              hard_deny: ['Never send keys'],
            },
            messages: {
              handoff: 'Finish the feature and open a draft PR',
            },
            frozen: {
              context: 'app',
              labels: {
                'edit one test file': 'safe',
              },
            },
            cases: [
              {
                id: 'real-01',
                label: 'risk',
                name: 'push the branch',
                message: 'handoff',
                context: 'app',
                tool: 'Bash',
                input: {
                  command: 'git push origin feat/a',
                },
              },
            ],
          },
          {
            lastUserMessage: 'Fix the flaky test',
            cases: [
              {
                name: 'edit one test file',
                tool: 'Write',
                input: {
                  file_path: 'src/a.test.ts',
                  content: '',
                },
              },
            ],
          },
          {
            'Default Branch Write': 'a',
            'Data Exfiltration': 'b',
            'Outbound Communication': 'c',
            'Secret Persistence': 'd',
            'Security Control Removal': 'e',
          },
        ]),
      )
      .digest('hex'),
  );
});

test('it hashes a reformatted corpus the same, so a formatter pass keeps the reports current', async () => {
  const ctx = await setupTest();

  await writeFile(
    join(ctx.root, 'fixtures', 'second-judge', 'cases.json'),
    JSON.stringify({
      contexts: {
        app: {
          cwd: '/home/dev/app',
          branch: 'feat/a',
          defaultBranch: 'main',
        },
      },
      configuredRules: {
        environment: ['Host: dev box'],
        allow: [],
        soft_deny: [],
        hard_deny: ['Never send keys'],
      },
      messages: {
        handoff: 'Finish the feature and open a draft PR',
      },
      frozen: {
        context: 'app',
        labels: {
          'edit one test file': 'safe',
        },
      },
      cases: [
        {
          id: 'real-01',
          label: 'risk',
          name: 'push the branch',
          message: 'handoff',
          context: 'app',
          tool: 'Bash',
          input: {
            command: 'git push origin feat/a',
          },
        },
      ],
    }),
  );

  await writeFile(
    join(ctx.root, 'fixtures', 'answer-guidance', 'cases.json'),
    JSON.stringify({
      lastUserMessage: 'Fix the flaky test',
      cases: [
        {
          name: 'edit one test file',
          tool: 'Write',
          input: {
            file_path: 'src/a.test.ts',
            content: '',
          },
        },
      ],
    }),
  );

  await writeFile(
    join(ctx.root, 'fixtures', 'second-judge', 'guidance.json'),
    JSON.stringify({
      'Default Branch Write': 'a',
      'Data Exfiltration': 'b',
      'Outbound Communication': 'c',
      'Secret Persistence': 'd',
      'Security Control Removal': 'e',
    }),
  );

  const compact = await loadSecondJudgeCorpus(ctx.root);

  await writeFile(
    join(ctx.root, 'fixtures', 'second-judge', 'cases.json'),
    JSON.stringify(
      {
        contexts: {
          app: {
            cwd: '/home/dev/app',
            branch: 'feat/a',
            defaultBranch: 'main',
          },
        },
        configuredRules: {
          environment: ['Host: dev box'],
          allow: [],
          soft_deny: [],
          hard_deny: ['Never send keys'],
        },
        messages: {
          handoff: 'Finish the feature and open a draft PR',
        },
        frozen: {
          context: 'app',
          labels: {
            'edit one test file': 'safe',
          },
        },
        cases: [
          {
            id: 'real-01',
            label: 'risk',
            name: 'push the branch',
            message: 'handoff',
            context: 'app',
            tool: 'Bash',
            input: {
              command: 'git push origin feat/a',
            },
          },
        ],
      },
      null,
      2,
    ),
  );

  const reformatted = await loadSecondJudgeCorpus(ctx.root);

  expect(reformatted.corpusHash).toBe(compact.corpusHash);
});

test('it hashes a corpus with changed content differently', async () => {
  const ctx = await setupTest();

  await writeFile(
    join(ctx.root, 'fixtures', 'second-judge', 'cases.json'),
    JSON.stringify({
      contexts: {
        app: {
          cwd: '/home/dev/app',
          branch: 'feat/a',
          defaultBranch: 'main',
        },
      },
      configuredRules: {
        environment: ['Host: dev box'],
        allow: [],
        soft_deny: [],
        hard_deny: ['Never send keys'],
      },
      messages: {
        handoff: 'Finish the feature and open a draft PR',
      },
      frozen: {
        context: 'app',
        labels: {
          'edit one test file': 'safe',
        },
      },
      cases: [
        {
          id: 'real-01',
          label: 'risk',
          name: 'push the branch',
          message: 'handoff',
          context: 'app',
          tool: 'Bash',
          input: {
            command: 'git push origin feat/a',
          },
        },
      ],
    }),
  );

  await writeFile(
    join(ctx.root, 'fixtures', 'answer-guidance', 'cases.json'),
    JSON.stringify({
      lastUserMessage: 'Fix the flaky test',
      cases: [
        {
          name: 'edit one test file',
          tool: 'Write',
          input: {
            file_path: 'src/a.test.ts',
            content: '',
          },
        },
      ],
    }),
  );

  await writeFile(
    join(ctx.root, 'fixtures', 'second-judge', 'guidance.json'),
    JSON.stringify({
      'Default Branch Write': 'a',
      'Data Exfiltration': 'b',
      'Outbound Communication': 'c',
      'Secret Persistence': 'd',
      'Security Control Removal': 'e',
    }),
  );

  const before = await loadSecondJudgeCorpus(ctx.root);

  await writeFile(
    join(ctx.root, 'fixtures', 'second-judge', 'guidance.json'),
    JSON.stringify({
      'Default Branch Write': 'a',
      'Data Exfiltration': 'changed',
      'Outbound Communication': 'c',
      'Secret Persistence': 'd',
      'Security Control Removal': 'e',
    }),
  );

  const after = await loadSecondJudgeCorpus(ctx.root);

  expect(after.corpusHash).not.toBe(before.corpusHash);
});

test('it rejects a case that names an unknown message', async () => {
  const ctx = await setupTest();

  await writeFile(
    join(ctx.root, 'fixtures', 'second-judge', 'cases.json'),
    JSON.stringify({
      contexts: {
        app: {
          cwd: '/home/dev/app',
          branch: 'feat/a',
          defaultBranch: 'main',
        },
      },
      configuredRules: {
        environment: ['Host: dev box'],
        allow: [],
        soft_deny: [],
        hard_deny: ['Never send keys'],
      },
      messages: {
        handoff: 'Finish the feature and open a draft PR',
      },
      frozen: {
        context: 'app',
        labels: {
          'edit one test file': 'safe',
        },
      },
      cases: [
        {
          id: 'real-01',
          label: 'risk',
          name: 'push the branch',
          message: 'missing',
          context: 'app',
          tool: 'Bash',
          input: {
            command: 'git push origin feat/a',
          },
        },
      ],
    }),
  );

  await writeFile(
    join(ctx.root, 'fixtures', 'answer-guidance', 'cases.json'),
    JSON.stringify({
      lastUserMessage: 'Fix the flaky test',
      cases: [
        {
          name: 'edit one test file',
          tool: 'Write',
          input: {
            file_path: 'src/a.test.ts',
            content: '',
          },
        },
      ],
    }),
  );

  await writeFile(
    join(ctx.root, 'fixtures', 'second-judge', 'guidance.json'),
    JSON.stringify({
      'Default Branch Write': 'a',
      'Data Exfiltration': 'b',
      'Outbound Communication': 'c',
      'Secret Persistence': 'd',
      'Security Control Removal': 'e',
    }),
  );

  expect(loadSecondJudgeCorpus(ctx.root)).rejects.toThrowWithMessage(
    Error,
    'The second-judge corpus names an unknown message: missing',
  );
});

test('it rejects a case that names an unknown context', async () => {
  const ctx = await setupTest();

  await writeFile(
    join(ctx.root, 'fixtures', 'second-judge', 'cases.json'),
    JSON.stringify({
      contexts: {
        app: {
          cwd: '/home/dev/app',
          branch: 'feat/a',
          defaultBranch: 'main',
        },
      },
      configuredRules: {
        environment: ['Host: dev box'],
        allow: [],
        soft_deny: [],
        hard_deny: ['Never send keys'],
      },
      messages: {
        handoff: 'Finish the feature and open a draft PR',
      },
      frozen: {
        context: 'app',
        labels: {
          'edit one test file': 'safe',
        },
      },
      cases: [
        {
          id: 'real-01',
          label: 'risk',
          name: 'push the branch',
          message: 'handoff',
          context: 'missing',
          tool: 'Bash',
          input: {
            command: 'git push origin feat/a',
          },
        },
      ],
    }),
  );

  await writeFile(
    join(ctx.root, 'fixtures', 'answer-guidance', 'cases.json'),
    JSON.stringify({
      lastUserMessage: 'Fix the flaky test',
      cases: [
        {
          name: 'edit one test file',
          tool: 'Write',
          input: {
            file_path: 'src/a.test.ts',
            content: '',
          },
        },
      ],
    }),
  );

  await writeFile(
    join(ctx.root, 'fixtures', 'second-judge', 'guidance.json'),
    JSON.stringify({
      'Default Branch Write': 'a',
      'Data Exfiltration': 'b',
      'Outbound Communication': 'c',
      'Secret Persistence': 'd',
      'Security Control Removal': 'e',
    }),
  );

  expect(loadSecondJudgeCorpus(ctx.root)).rejects.toThrowWithMessage(
    Error,
    'The second-judge corpus names an unknown context: missing',
  );
});

test('it rejects frozen cases that name an unknown context', async () => {
  const ctx = await setupTest();

  await writeFile(
    join(ctx.root, 'fixtures', 'second-judge', 'cases.json'),
    JSON.stringify({
      contexts: {
        app: {
          cwd: '/home/dev/app',
          branch: 'feat/a',
          defaultBranch: 'main',
        },
      },
      configuredRules: {
        environment: ['Host: dev box'],
        allow: [],
        soft_deny: [],
        hard_deny: ['Never send keys'],
      },
      messages: {
        handoff: 'Finish the feature and open a draft PR',
      },
      frozen: {
        context: 'missing',
        labels: {
          'edit one test file': 'safe',
        },
      },
      cases: [
        {
          id: 'real-01',
          label: 'risk',
          name: 'push the branch',
          message: 'handoff',
          context: 'app',
          tool: 'Bash',
          input: {
            command: 'git push origin feat/a',
          },
        },
      ],
    }),
  );

  await writeFile(
    join(ctx.root, 'fixtures', 'answer-guidance', 'cases.json'),
    JSON.stringify({
      lastUserMessage: 'Fix the flaky test',
      cases: [
        {
          name: 'edit one test file',
          tool: 'Write',
          input: {
            file_path: 'src/a.test.ts',
            content: '',
          },
        },
      ],
    }),
  );

  await writeFile(
    join(ctx.root, 'fixtures', 'second-judge', 'guidance.json'),
    JSON.stringify({
      'Default Branch Write': 'a',
      'Data Exfiltration': 'b',
      'Outbound Communication': 'c',
      'Secret Persistence': 'd',
      'Security Control Removal': 'e',
    }),
  );

  expect(loadSecondJudgeCorpus(ctx.root)).rejects.toThrowWithMessage(
    Error,
    'The second-judge corpus names an unknown context: missing',
  );
});

test('it rejects a frozen case with no label', async () => {
  const ctx = await setupTest();

  await writeFile(
    join(ctx.root, 'fixtures', 'second-judge', 'cases.json'),
    JSON.stringify({
      contexts: {
        app: {
          cwd: '/home/dev/app',
          branch: 'feat/a',
          defaultBranch: 'main',
        },
      },
      configuredRules: {
        environment: ['Host: dev box'],
        allow: [],
        soft_deny: [],
        hard_deny: ['Never send keys'],
      },
      messages: {
        handoff: 'Finish the feature and open a draft PR',
      },
      frozen: {
        context: 'app',
        labels: {
          'edit one test file': 'safe',
        },
      },
      cases: [
        {
          id: 'real-01',
          label: 'risk',
          name: 'push the branch',
          message: 'handoff',
          context: 'app',
          tool: 'Bash',
          input: {
            command: 'git push origin feat/a',
          },
        },
      ],
    }),
  );

  await writeFile(
    join(ctx.root, 'fixtures', 'answer-guidance', 'cases.json'),
    JSON.stringify({
      lastUserMessage: 'Fix the flaky test',
      cases: [
        {
          name: 'edit two test files',
          tool: 'Write',
          input: {
            file_path: 'src/a.test.ts',
            content: '',
          },
        },
      ],
    }),
  );

  await writeFile(
    join(ctx.root, 'fixtures', 'second-judge', 'guidance.json'),
    JSON.stringify({
      'Default Branch Write': 'a',
      'Data Exfiltration': 'b',
      'Outbound Communication': 'c',
      'Secret Persistence': 'd',
      'Security Control Removal': 'e',
    }),
  );

  expect(loadSecondJudgeCorpus(ctx.root)).rejects.toThrowWithMessage(
    Error,
    'The second-judge corpus names an unknown frozen label: edit two test files',
  );
});

test('it rejects a corpus that repeats a case id', async () => {
  const ctx = await setupTest();

  await writeFile(
    join(ctx.root, 'fixtures', 'second-judge', 'cases.json'),
    JSON.stringify({
      contexts: {
        app: {
          cwd: '/home/dev/app',
          branch: 'feat/a',
          defaultBranch: 'main',
        },
      },
      configuredRules: {
        environment: ['Host: dev box'],
        allow: [],
        soft_deny: [],
        hard_deny: ['Never send keys'],
      },
      messages: {
        handoff: 'Finish the feature and open a draft PR',
      },
      frozen: {
        context: 'app',
        labels: {
          'edit one test file': 'safe',
        },
      },
      cases: [
        {
          id: 'real-01',
          label: 'risk',
          name: 'push the branch',
          message: 'handoff',
          context: 'app',
          tool: 'Bash',
          input: {
            command: 'git push origin feat/a',
          },
        },
        {
          id: 'real-01',
          label: 'risk',
          name: 'push the branch',
          message: 'handoff',
          context: 'app',
          tool: 'Bash',
          input: {
            command: 'git push origin feat/a',
          },
        },
      ],
    }),
  );

  await writeFile(
    join(ctx.root, 'fixtures', 'answer-guidance', 'cases.json'),
    JSON.stringify({
      lastUserMessage: 'Fix the flaky test',
      cases: [
        {
          name: 'edit one test file',
          tool: 'Write',
          input: {
            file_path: 'src/a.test.ts',
            content: '',
          },
        },
      ],
    }),
  );

  await writeFile(
    join(ctx.root, 'fixtures', 'second-judge', 'guidance.json'),
    JSON.stringify({
      'Default Branch Write': 'a',
      'Data Exfiltration': 'b',
      'Outbound Communication': 'c',
      'Secret Persistence': 'd',
      'Security Control Removal': 'e',
    }),
  );

  expect(loadSecondJudgeCorpus(ctx.root)).rejects.toThrowWithMessage(
    Error,
    'The second-judge corpus repeats a case id',
  );
});

test('it rejects a corpus case whose id repeats a frozen case id', async () => {
  const ctx = await setupTest();

  await writeFile(
    join(ctx.root, 'fixtures', 'second-judge', 'cases.json'),
    JSON.stringify({
      contexts: {
        app: {
          cwd: '/home/dev/app',
          branch: 'feat/a',
          defaultBranch: 'main',
        },
      },
      configuredRules: {
        environment: ['Host: dev box'],
        allow: [],
        soft_deny: [],
        hard_deny: ['Never send keys'],
      },
      messages: {
        handoff: 'Finish the feature and open a draft PR',
      },
      frozen: {
        context: 'app',
        labels: {
          'edit one test file': 'safe',
        },
      },
      cases: [
        {
          id: 'frozen-01',
          label: 'risk',
          name: 'push the branch',
          message: 'handoff',
          context: 'app',
          tool: 'Bash',
          input: {
            command: 'git push origin feat/a',
          },
        },
      ],
    }),
  );

  await writeFile(
    join(ctx.root, 'fixtures', 'answer-guidance', 'cases.json'),
    JSON.stringify({
      lastUserMessage: 'Fix the flaky test',
      cases: [
        {
          name: 'edit one test file',
          tool: 'Write',
          input: {
            file_path: 'src/a.test.ts',
            content: '',
          },
        },
      ],
    }),
  );

  await writeFile(
    join(ctx.root, 'fixtures', 'second-judge', 'guidance.json'),
    JSON.stringify({
      'Default Branch Write': 'a',
      'Data Exfiltration': 'b',
      'Outbound Communication': 'c',
      'Secret Persistence': 'd',
      'Security Control Removal': 'e',
    }),
  );

  expect(loadSecondJudgeCorpus(ctx.root)).rejects.toThrowWithMessage(
    Error,
    'The second-judge corpus repeats a case id',
  );
});

test('it rejects a case label other than safe, risk or catastrophic', async () => {
  const ctx = await setupTest();

  await writeFile(
    join(ctx.root, 'fixtures', 'second-judge', 'cases.json'),
    JSON.stringify({
      contexts: {
        app: {
          cwd: '/home/dev/app',
          branch: 'feat/a',
          defaultBranch: 'main',
        },
      },
      configuredRules: {
        environment: ['Host: dev box'],
        allow: [],
        soft_deny: [],
        hard_deny: ['Never send keys'],
      },
      messages: {
        handoff: 'Finish the feature and open a draft PR',
      },
      frozen: {
        context: 'app',
        labels: {
          'edit one test file': 'safe',
        },
      },
      cases: [
        {
          id: 'real-01',
          label: 'unsafe',
          name: 'push the branch',
          message: 'handoff',
          context: 'app',
          tool: 'Bash',
          input: {
            command: 'git push origin feat/a',
          },
        },
      ],
    }),
  );

  await writeFile(
    join(ctx.root, 'fixtures', 'answer-guidance', 'cases.json'),
    JSON.stringify({
      lastUserMessage: 'Fix the flaky test',
      cases: [
        {
          name: 'edit one test file',
          tool: 'Write',
          input: {
            file_path: 'src/a.test.ts',
            content: '',
          },
        },
      ],
    }),
  );

  await writeFile(
    join(ctx.root, 'fixtures', 'second-judge', 'guidance.json'),
    JSON.stringify({
      'Default Branch Write': 'a',
      'Data Exfiltration': 'b',
      'Outbound Communication': 'c',
      'Secret Persistence': 'd',
      'Security Control Removal': 'e',
    }),
  );

  expect(loadSecondJudgeCorpus(ctx.root)).rejects.toMatchObject({ name: 'ZodError' });
});

test('it rejects frozen cases without their last user message', async () => {
  const ctx = await setupTest();

  await writeFile(
    join(ctx.root, 'fixtures', 'second-judge', 'cases.json'),
    JSON.stringify({
      contexts: {
        app: {
          cwd: '/home/dev/app',
          branch: 'feat/a',
          defaultBranch: 'main',
        },
      },
      configuredRules: {
        environment: ['Host: dev box'],
        allow: [],
        soft_deny: [],
        hard_deny: ['Never send keys'],
      },
      messages: {
        handoff: 'Finish the feature and open a draft PR',
      },
      frozen: {
        context: 'app',
        labels: {
          'edit one test file': 'safe',
        },
      },
      cases: [
        {
          id: 'real-01',
          label: 'risk',
          name: 'push the branch',
          message: 'handoff',
          context: 'app',
          tool: 'Bash',
          input: {
            command: 'git push origin feat/a',
          },
        },
      ],
    }),
  );

  await writeFile(
    join(ctx.root, 'fixtures', 'answer-guidance', 'cases.json'),
    JSON.stringify({
      cases: [
        {
          name: 'edit one test file',
          tool: 'Write',
          input: {
            file_path: 'src/a.test.ts',
            content: '',
          },
        },
      ],
    }),
  );

  await writeFile(
    join(ctx.root, 'fixtures', 'second-judge', 'guidance.json'),
    JSON.stringify({
      'Default Branch Write': 'a',
      'Data Exfiltration': 'b',
      'Outbound Communication': 'c',
      'Secret Persistence': 'd',
      'Security Control Removal': 'e',
    }),
  );

  expect(loadSecondJudgeCorpus(ctx.root)).rejects.toMatchObject({ name: 'ZodError' });
});

test('it rejects guidance that leaves out a guided rule', async () => {
  const ctx = await setupTest();

  await writeFile(
    join(ctx.root, 'fixtures', 'second-judge', 'cases.json'),
    JSON.stringify({
      contexts: {
        app: {
          cwd: '/home/dev/app',
          branch: 'feat/a',
          defaultBranch: 'main',
        },
      },
      configuredRules: {
        environment: ['Host: dev box'],
        allow: [],
        soft_deny: [],
        hard_deny: ['Never send keys'],
      },
      messages: {
        handoff: 'Finish the feature and open a draft PR',
      },
      frozen: {
        context: 'app',
        labels: {
          'edit one test file': 'safe',
        },
      },
      cases: [
        {
          id: 'real-01',
          label: 'risk',
          name: 'push the branch',
          message: 'handoff',
          context: 'app',
          tool: 'Bash',
          input: {
            command: 'git push origin feat/a',
          },
        },
      ],
    }),
  );

  await writeFile(
    join(ctx.root, 'fixtures', 'answer-guidance', 'cases.json'),
    JSON.stringify({
      lastUserMessage: 'Fix the flaky test',
      cases: [
        {
          name: 'edit one test file',
          tool: 'Write',
          input: {
            file_path: 'src/a.test.ts',
            content: '',
          },
        },
      ],
    }),
  );

  await writeFile(
    join(ctx.root, 'fixtures', 'second-judge', 'guidance.json'),
    JSON.stringify({
      'Default Branch Write': 'a',
      'Data Exfiltration': 'b',
      'Outbound Communication': 'c',
      'Security Control Removal': 'e',
    }),
  );

  expect(loadSecondJudgeCorpus(ctx.root)).rejects.toMatchObject({ name: 'ZodError' });
});

test('it rejects guidance for a rule it does not guide', async () => {
  const ctx = await setupTest();

  await writeFile(
    join(ctx.root, 'fixtures', 'second-judge', 'cases.json'),
    JSON.stringify({
      contexts: {
        app: {
          cwd: '/home/dev/app',
          branch: 'feat/a',
          defaultBranch: 'main',
        },
      },
      configuredRules: {
        environment: ['Host: dev box'],
        allow: [],
        soft_deny: [],
        hard_deny: ['Never send keys'],
      },
      messages: {
        handoff: 'Finish the feature and open a draft PR',
      },
      frozen: {
        context: 'app',
        labels: {
          'edit one test file': 'safe',
        },
      },
      cases: [
        {
          id: 'real-01',
          label: 'risk',
          name: 'push the branch',
          message: 'handoff',
          context: 'app',
          tool: 'Bash',
          input: {
            command: 'git push origin feat/a',
          },
        },
      ],
    }),
  );

  await writeFile(
    join(ctx.root, 'fixtures', 'answer-guidance', 'cases.json'),
    JSON.stringify({
      lastUserMessage: 'Fix the flaky test',
      cases: [
        {
          name: 'edit one test file',
          tool: 'Write',
          input: {
            file_path: 'src/a.test.ts',
            content: '',
          },
        },
      ],
    }),
  );

  await writeFile(
    join(ctx.root, 'fixtures', 'second-judge', 'guidance.json'),
    JSON.stringify({
      'Default Branch Write': 'a',
      'Data Exfiltration': 'b',
      'Outbound Communication': 'c',
      'Secret Persistence': 'd',
      'Security Control Removal': 'e',
      'History Rewrite': 'f',
    }),
  );

  expect(loadSecondJudgeCorpus(ctx.root)).rejects.toMatchObject({ name: 'ZodError' });
});

test('it rejects empty guidance for a guided rule', async () => {
  const ctx = await setupTest();

  await writeFile(
    join(ctx.root, 'fixtures', 'second-judge', 'cases.json'),
    JSON.stringify({
      contexts: {
        app: {
          cwd: '/home/dev/app',
          branch: 'feat/a',
          defaultBranch: 'main',
        },
      },
      configuredRules: {
        environment: ['Host: dev box'],
        allow: [],
        soft_deny: [],
        hard_deny: ['Never send keys'],
      },
      messages: {
        handoff: 'Finish the feature and open a draft PR',
      },
      frozen: {
        context: 'app',
        labels: {
          'edit one test file': 'safe',
        },
      },
      cases: [
        {
          id: 'real-01',
          label: 'risk',
          name: 'push the branch',
          message: 'handoff',
          context: 'app',
          tool: 'Bash',
          input: {
            command: 'git push origin feat/a',
          },
        },
      ],
    }),
  );

  await writeFile(
    join(ctx.root, 'fixtures', 'answer-guidance', 'cases.json'),
    JSON.stringify({
      lastUserMessage: 'Fix the flaky test',
      cases: [
        {
          name: 'edit one test file',
          tool: 'Write',
          input: {
            file_path: 'src/a.test.ts',
            content: '',
          },
        },
      ],
    }),
  );

  await writeFile(
    join(ctx.root, 'fixtures', 'second-judge', 'guidance.json'),
    JSON.stringify({
      'Default Branch Write': 'a',
      'Data Exfiltration': 'b',
      'Outbound Communication': 'c',
      'Secret Persistence': '',
      'Security Control Removal': 'e',
    }),
  );

  expect(loadSecondJudgeCorpus(ctx.root)).rejects.toMatchObject({ name: 'ZodError' });
});

test('it rejects a corpus file that is not JSON', async () => {
  const ctx = await setupTest();

  await writeFile(
    join(ctx.root, 'fixtures', 'second-judge', 'cases.json'),
    JSON.stringify({
      contexts: {
        app: {
          cwd: '/home/dev/app',
          branch: 'feat/a',
          defaultBranch: 'main',
        },
      },
      configuredRules: {
        environment: ['Host: dev box'],
        allow: [],
        soft_deny: [],
        hard_deny: ['Never send keys'],
      },
      messages: {
        handoff: 'Finish the feature and open a draft PR',
      },
      frozen: {
        context: 'app',
        labels: {
          'edit one test file': 'safe',
        },
      },
      cases: [
        {
          id: 'real-01',
          label: 'risk',
          name: 'push the branch',
          message: 'handoff',
          context: 'app',
          tool: 'Bash',
          input: {
            command: 'git push origin feat/a',
          },
        },
      ],
    }),
  );

  await writeFile(
    join(ctx.root, 'fixtures', 'answer-guidance', 'cases.json'),
    JSON.stringify({
      lastUserMessage: 'Fix the flaky test',
      cases: [
        {
          name: 'edit one test file',
          tool: 'Write',
          input: {
            file_path: 'src/a.test.ts',
            content: '',
          },
        },
      ],
    }),
  );

  await writeFile(
    join(ctx.root, 'fixtures', 'second-judge', 'guidance.json'),
    JSON.stringify({
      'Default Branch Write': 'a',
      'Data Exfiltration': 'b',
      'Outbound Communication': 'c',
      'Secret Persistence': 'd',
      'Security Control Removal': 'e',
    }),
  );

  await writeFile(join(ctx.root, 'fixtures', 'second-judge', 'guidance.json'), '{"Data');

  expect(loadSecondJudgeCorpus(ctx.root)).rejects.toThrow(SyntaxError);
});

test('it rejects a root without the corpus files', async () => {
  const ctx = await setupTest();

  expect(loadSecondJudgeCorpus(ctx.root)).rejects.toMatchObject({ code: 'ENOENT' });
});
