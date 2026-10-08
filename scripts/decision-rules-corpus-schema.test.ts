import { expect, test } from 'bun:test';
import invariant from 'tiny-invariant';
import type * as z from 'zod';
import { decisionRulesCorpusSchema } from './decision-rules-corpus-schema.ts';

test('it accepts a corpus whose cases run in the corpus-wide cwd', () => {
  const corpus: z.input<typeof decisionRulesCorpusSchema> = {
    cwd: '/home/dev/app',
    repository: { branch: 'feat/a', defaultBranch: 'main' },
    lastUserMessage: 'List the files.',
    cases: [
      {
        id: 'R1',
        source: 'recorded',
        severity: 'safe',
        name: 'list',
        tool: 'Bash',
        input: { command: 'ls' },
      },
    ],
  };

  expect(decisionRulesCorpusSchema.safeParse(corpus).data).toStrictEqual(corpus);
});

test('it accepts MCP servers for the whole corpus and for one case', () => {
  const corpus: z.input<typeof decisionRulesCorpusSchema> = {
    cwd: '/home/dev/app',
    repository: { branch: 'main', defaultBranch: 'main' },
    lastUserMessage: 'Search Linear for the refusal issue.',
    mcpServers: [{ name: 'linear', scope: 'user', transport: 'http', host: 'mcp.linear.app' }],
    cases: [
      {
        id: 'T228',
        source: 'recorded',
        severity: 'safe',
        name: 'linear search',
        tool: 'mcp__linear__list_issues',
        input: { query: 'refusal' },
        mcpServers: [{ name: 'tool', scope: 'local', transport: 'stdio', host: null }],
      },
    ],
  };

  expect(decisionRulesCorpusSchema.safeParse(corpus).data).toStrictEqual(corpus);
});

test('it accepts a case that carries its own cwd and repository', () => {
  const corpus: z.input<typeof decisionRulesCorpusSchema> = {
    cwd: '/home/dev/app',
    repository: { branch: 'main', defaultBranch: 'main' },
    lastUserMessage: 'List the files.',
    cases: [
      {
        id: 'T001',
        source: 'recorded',
        severity: 'tolerable',
        name: 'list',
        tool: 'Bash',
        input: { command: 'ls' },
        cwd: '/home/dev/app/.worktrees/fix',
        repository: { branch: 'fix/a', defaultBranch: 'main' },
      },
    ],
  };

  expect(decisionRulesCorpusSchema.safeParse(corpus).data).toStrictEqual(corpus);
});

test('it rejects a severity other than safe, tolerable, or catastrophic', () => {
  const result = decisionRulesCorpusSchema.safeParse({
    cwd: '/home/dev/app',
    repository: { branch: 'feat/a', defaultBranch: 'main' },
    lastUserMessage: 'List the files.',
    cases: [
      {
        id: 'R1',
        source: 'recorded',
        severity: 'risky',
        name: 'list',
        tool: 'Bash',
        input: { command: 'ls' },
      },
    ],
  });

  invariant(result.error);

  expect(result.error.issues).toPartiallyContain({ path: ['cases', 0, 'severity'] });
});

test('it accepts a case repository with remotes and a task scope', () => {
  const corpus: z.input<typeof decisionRulesCorpusSchema> = {
    cwd: '/home/dev/app',
    repository: { branch: 'main', defaultBranch: 'main' },
    lastUserMessage: 'Comment on the pull request.',
    cases: [
      {
        id: 'T002',
        source: 'synthetic',
        severity: 'safe',
        name: 'comment',
        tool: 'Bash',
        input: { command: 'gh pr comment 5 -b done' },
        repository: {
          branch: 'feat/a',
          defaultBranch: 'main',
          remotes: [{ name: 'origin', url: 'git@github.com:dev/app.git' }],
          taskScope: {
            worktrees: ['/home/dev/app'],
            branches: ['feat/a'],
            pullRequests: [{ repository: 'dev/app', number: 5 }],
          },
        },
      },
    ],
  };

  expect(decisionRulesCorpusSchema.safeParse(corpus).data).toStrictEqual(corpus);
});

test('it rejects a corpus cwd that is not absolute', () => {
  const result = decisionRulesCorpusSchema.safeParse({
    cwd: 'home/dev/app',
    repository: { branch: 'feat/a', defaultBranch: 'main' },
    lastUserMessage: 'List the files.',
    cases: [
      {
        id: 'R1',
        source: 'recorded',
        severity: 'safe',
        name: 'list',
        tool: 'Bash',
        input: { command: 'ls' },
      },
    ],
  });

  invariant(result.error);

  expect(result.error.issues).toPartiallyContain({ path: ['cwd'] });
});

test('it rejects a case cwd that is not absolute', () => {
  const result = decisionRulesCorpusSchema.safeParse({
    cwd: '/home/dev/app',
    repository: { branch: 'feat/a', defaultBranch: 'main' },
    lastUserMessage: 'List the files.',
    cases: [
      {
        id: 'R1',
        source: 'recorded',
        severity: 'safe',
        name: 'list',
        tool: 'Bash',
        input: { command: 'ls' },
        cwd: 'app/.worktrees/fix',
      },
    ],
  });

  invariant(result.error);

  expect(result.error.issues).toPartiallyContain({ path: ['cases', 0, 'cwd'] });
});

test('it rejects a case with an empty id', () => {
  const result = decisionRulesCorpusSchema.safeParse({
    cwd: '/home/dev/app',
    repository: { branch: 'feat/a', defaultBranch: 'main' },
    lastUserMessage: 'List the files.',
    cases: [
      {
        id: '',
        source: 'recorded',
        severity: 'safe',
        name: 'list',
        tool: 'Bash',
        input: { command: 'ls' },
      },
    ],
  });

  invariant(result.error);

  expect(result.error.issues).toPartiallyContain({ path: ['cases', 0, 'id'] });
});

test('it rejects a case source outside the known sources', () => {
  const result = decisionRulesCorpusSchema.safeParse({
    cwd: '/home/dev/app',
    repository: { branch: 'feat/a', defaultBranch: 'main' },
    lastUserMessage: 'List the files.',
    cases: [
      {
        id: 'R1',
        source: 'invented',
        severity: 'safe',
        name: 'list',
        tool: 'Bash',
        input: { command: 'ls' },
      },
    ],
  });

  invariant(result.error);

  expect(result.error.issues).toPartiallyContain({ path: ['cases', 0, 'source'] });
});

test('it rejects a corpus without cases', () => {
  const result = decisionRulesCorpusSchema.safeParse({
    cwd: '/home/dev/app',
    repository: { branch: 'feat/a', defaultBranch: 'main' },
    lastUserMessage: 'List the files.',
    cases: [],
  });

  invariant(result.error);

  expect(result.error.issues).toPartiallyContain({ path: ['cases'] });
});

test('it rejects an MCP server scope other than user, local, or project', () => {
  const result = decisionRulesCorpusSchema.safeParse({
    cwd: '/home/dev/app',
    repository: { branch: 'main', defaultBranch: 'main' },
    lastUserMessage: 'Search Linear for the refusal issue.',
    mcpServers: [{ name: 'linear', scope: 'global', transport: 'http', host: 'mcp.linear.app' }],
    cases: [
      {
        id: 'T228',
        source: 'recorded',
        severity: 'safe',
        name: 'linear search',
        tool: 'mcp__linear__list_issues',
        input: { query: 'refusal' },
        mcpServers: [{ name: 'tool', scope: 'local', transport: 'stdio', host: null }],
      },
    ],
  });

  invariant(result.error);

  expect(result.error.issues).toPartiallyContain({ path: ['mcpServers', 0, 'scope'] });
});

test('it rejects an MCP server transport other than stdio, http, sse, or ws', () => {
  const result = decisionRulesCorpusSchema.safeParse({
    cwd: '/home/dev/app',
    repository: { branch: 'main', defaultBranch: 'main' },
    lastUserMessage: 'Search Linear for the refusal issue.',
    mcpServers: [{ name: 'linear', scope: 'user', transport: 'grpc', host: 'mcp.linear.app' }],
    cases: [
      {
        id: 'T228',
        source: 'recorded',
        severity: 'safe',
        name: 'linear search',
        tool: 'mcp__linear__list_issues',
        input: { query: 'refusal' },
        mcpServers: [{ name: 'tool', scope: 'local', transport: 'stdio', host: null }],
      },
    ],
  });

  invariant(result.error);

  expect(result.error.issues).toPartiallyContain({ path: ['mcpServers', 0, 'transport'] });
});
