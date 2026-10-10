import { expect, test } from 'bun:test';
import { buildAnonymisedCorpus } from './build-anonymised-corpus.ts';

test('it rewrites a recorded action into placeholders and keeps its shape', () => {
  expect(
    buildAnonymisedCorpus(
      [
        {
          cwd: '/home/robin/projects/harbor/.worktrees/fix-imp',
          decidingStage: 'containment',
          verdict: {
            kind: 'deny',
            rule: 'Outside Task Scope',
            reason: 'writes /home/robin/projects/harbor/README.md',
          },
          request: {
            sessionID: 'ad77ccd8-9f10-4b62-b299-1a9f2f444c54',
            toolUseID: 'toolu_01AvmG4QJ3Ya8WYRjV3NWNDC',
            cwd: '/home/robin/projects/harbor/.worktrees/fix-imp',
            toolName: 'Bash',
            toolInput: {
              command: 'git push origin fix-imp && gh pr create --repo acme/harbor --head fix-imp',
              description: 'Push fix-imp for robin',
            },
            context: {
              agentID: null,
              originalUserTask: { text: 'mail robin@acme.dev when harbor is green', origin: 'sdk' },
              delegatedTask: null,
              lastDirectUserMessage: null,
              omittedTaskContext: [],
            },
          },
        },
      ],
      'golden-salt',
    ),
  ).toMatchInlineSnapshot(`
    {
      "cases": [
        {
          "decidingStage": "containment",
          "id": "recorded-0001",
          "recordedVerdict": {
            "kind": "deny",
            "reason": "writes /home/user-4843c5bd/projects/repo-b759ee7c/README.md",
            "rule": "Outside Task Scope",
          },
          "request": {
            "context": {
              "agentID": null,
              "delegatedTask": null,
              "lastDirectUserMessage": null,
              "omittedTaskContext": [],
              "originalUserTask": {
                "origin": "sdk",
                "text": "mail email-b7465b71@example.invalid when repo-b759ee7c is green",
              },
            },
            "cwd": "/home/user-4843c5bd/projects/repo-b759ee7c/.worktrees/branch-5c42e9c0",
            "sessionID": "session-2af6c503",
            "toolInput": {
              "command": "git push origin branch-5c42e9c0 && gh pr create --repo owner-6db1691e/repo-b759ee7c --head branch-5c42e9c0",
              "description": "Push branch-5c42e9c0 for user-4843c5bd",
            },
            "toolName": "Bash",
            "toolUseID": "tool-39a93efb",
          },
          "source": "recorded",
        },
      ],
      "schemaVersion": 1,
    }
  `);
});

test('it builds the same corpus from the same captures and salt', () => {
  const actions = [
    {
      cwd: '/home/robin/harbor',
      decidingStage: 'jev',
      verdict: { kind: 'allow' },
      request: { cwd: '/home/robin/harbor', toolName: 'Bash', toolInput: { command: 'make' } },
    },
  ];

  expect(buildAnonymisedCorpus(actions, 'salt')).toStrictEqual(
    buildAnonymisedCorpus(actions, 'salt'),
  );
});

test('it gives one value a different placeholder under another salt', () => {
  const actions = [
    {
      cwd: '/home/robin/harbor',
      decidingStage: 'jev',
      verdict: null,
      request: { cwd: '/home/robin/harbor' },
    },
  ];

  const first = buildAnonymisedCorpus(actions, 'first-salt');
  const second = buildAnonymisedCorpus(actions, 'second-salt');

  expect(first.cases[0]?.request).not.toStrictEqual(second.cases[0]?.request);
});

test('it replaces the user name in a home path and wherever else the name appears', () => {
  const corpus = buildAnonymisedCorpus(
    [
      {
        cwd: '/tmp',
        decidingStage: 'jev',
        verdict: null,
        request: { file: '/Users/robin/notes.md', text: 'ask Robin first' },
      },
    ],
    'salt',
  );

  const request: unknown = corpus.cases[0]?.request;

  expect(request).toStrictEqual({
    file: expect.toSatisfy((value: string) => /^\/Users\/user-[0-9a-f]{8}\/notes\.md$/.test(value)),
    text: expect.toSatisfy((value: string) => /^ask user-[0-9a-f]{8} first$/.test(value)),
  });
});

test('it replaces an email address whole', () => {
  const corpus = buildAnonymisedCorpus(
    [{ cwd: '/tmp', decidingStage: 'jev', verdict: null, request: { text: 'cc ops@acme.dev' } }],
    'salt',
  );

  const request: unknown = corpus.cases[0]?.request;

  expect(request).toStrictEqual({
    text: expect.toSatisfy((value: string) =>
      /^cc email-[0-9a-f]{8}@example\.invalid$/.test(value),
    ),
  });
});

test('it replaces the host and user of a URL and keeps its scheme, port and path', () => {
  const corpus = buildAnonymisedCorpus(
    [
      {
        cwd: '/tmp',
        decidingStage: 'jev',
        verdict: null,
        request: { command: 'curl https://robin:hunter2@ci.acme.dev:8443/status?x=1' },
      },
    ],
    'salt',
  );

  const request: unknown = corpus.cases[0]?.request;

  expect(request).toStrictEqual({
    command: expect.toSatisfy((value: string) =>
      /^curl https:\/\/user-[0-9a-f]{8}@host-[0-9a-f]{8}\.example:8443\/status\?x=1$/.test(value),
    ),
  });
});

test('it keeps a loopback host', () => {
  const corpus = buildAnonymisedCorpus(
    [
      {
        cwd: '/tmp',
        decidingStage: 'jev',
        verdict: null,
        request: { command: 'curl http://localhost:3000/health' },
      },
    ],
    'salt',
  );

  const request: unknown = corpus.cases[0]?.request;

  expect(request).toStrictEqual({ command: 'curl http://localhost:3000/health' });
});

test('it replaces the repository owner and name of a remote everywhere they appear', () => {
  const corpus = buildAnonymisedCorpus(
    [
      {
        cwd: '/tmp',
        decidingStage: 'jev',
        verdict: null,
        request: {
          command: 'git remote add up git@github.com:acme/harbor.git',
          text: 'the harbor repo at acme',
        },
      },
    ],
    'salt',
  );

  const request: unknown = corpus.cases[0]?.request;

  expect(request).toStrictEqual({
    command: expect.toSatisfy((value: string) =>
      /^git remote add up git@host-[0-9a-f]{8}\.example:owner-[0-9a-f]{8}\/repo-[0-9a-f]{8}\.git$/.test(
        value,
      ),
    ),
    text: expect.toSatisfy((value: string) =>
      /^the repo-[0-9a-f]{8} repo at owner-[0-9a-f]{8}$/.test(value),
    ),
  });
});

test('it replaces a branch name and keeps the default branch', () => {
  const corpus = buildAnonymisedCorpus(
    [
      {
        cwd: '/tmp',
        decidingStage: 'jev',
        verdict: null,
        request: { command: 'git switch -c fix-login && git push origin fix-login main' },
      },
    ],
    'salt',
  );

  const request: unknown = corpus.cases[0]?.request;

  expect(request).toStrictEqual({
    command: expect.toSatisfy((value: string) =>
      /^git switch -c branch-(?<id>[0-9a-f]{8}) && git push origin branch-\k<id> main$/.test(value),
    ),
  });
});

test('it replaces tokens it recognises by shape, by assignment and by auth scheme', () => {
  // Joined at run time so this file's own text matches no gitleaks rule.
  const githubToken = ['ghp', 'A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8'].join('_');
  const assignedValue = ['qz7mw2', 'xk9vb4'].join('');
  const bearerValue = ['abcdefgh', '12345678'].join('');

  const corpus = buildAnonymisedCorpus(
    [
      {
        cwd: '/tmp',
        decidingStage: 'jev',
        verdict: null,
        request: {
          shape: `use ${githubToken}`,
          assignment: `export DEPLOY_KEY=${assignedValue}`,
          scheme: `curl -H "Authorization: Bearer ${bearerValue}"`,
        },
      },
    ],
    'salt',
  );

  const request: unknown = corpus.cases[0]?.request;

  expect(request).toStrictEqual({
    shape: expect.toSatisfy((value: string) => /^use token-[0-9a-f]{8}$/.test(value)),
    assignment: expect.toSatisfy((value: string) =>
      /^export DEPLOY_KEY=token-[0-9a-f]{8}$/.test(value),
    ),
    scheme: expect.toSatisfy((value: string) =>
      /^curl -H "Authorization: Bearer token-[0-9a-f]{8}"$/.test(value),
    ),
  });
});

test('it replaces the session, tool-use and agent identifiers', () => {
  const corpus = buildAnonymisedCorpus(
    [
      {
        cwd: '/tmp',
        decidingStage: 'jev',
        verdict: null,
        request: { sessionID: 's-1', toolUseID: 't-1', context: { agentID: 'a-1' } },
      },
    ],
    'salt',
  );

  const request: unknown = corpus.cases[0]?.request;

  expect(request).toStrictEqual({
    sessionID: expect.toSatisfy((value: string) => /^session-[0-9a-f]{8}$/.test(value)),
    toolUseID: expect.toSatisfy((value: string) => /^tool-[0-9a-f]{8}$/.test(value)),
    context: { agentID: expect.toSatisfy((value: string) => /^agent-[0-9a-f]{8}$/.test(value)) },
  });
});

test('it labels every case as recorded and keys it by its position', () => {
  const corpus = buildAnonymisedCorpus(
    [
      { cwd: '/tmp', decidingStage: 'local', verdict: { kind: 'allow' }, request: {} },
      { cwd: '/tmp', decidingStage: 'budget', verdict: null, request: {} },
    ],
    'salt',
  );

  expect(corpus).toStrictEqual({
    schemaVersion: 1,
    cases: [
      {
        id: 'recorded-0001',
        source: 'recorded',
        request: {},
        recordedVerdict: { kind: 'allow' },
        decidingStage: 'local',
      },
      {
        id: 'recorded-0002',
        source: 'recorded',
        request: {},
        recordedVerdict: null,
        decidingStage: 'budget',
      },
    ],
  });
});
