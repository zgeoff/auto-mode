import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadMCPServers } from './load-mcp-servers.ts';

async function setupTest() {
  const dir = await mkdtemp(join(tmpdir(), 'mcp-servers-'));

  onTestFinished(() => rm(dir, { recursive: true, force: true }));

  const repo = join(dir, 'repo');

  // The project lookup walks up to the nearest checkout, so the cwd sits in one.
  await mkdir(join(repo, '.git'), { recursive: true });

  // Claude Code keeps the user settings in .claude under the home.
  await mkdir(join(dir, '.claude'));

  return { dir, repo };
}

test('it lists user and local servers by name, scope, transport and host, and drops every credential', async () => {
  const ctx = await setupTest();

  await writeFile(
    join(ctx.dir, '.claude.json'),
    JSON.stringify({
      mcpServers: {
        linear: {
          type: 'http',
          url: 'https://user:planted-userinfo@mcp.linear.app/planted-path/sse?token=planted-query',
          headers: { Authorization: 'Bearer planted-header' },
        },
        tool: {
          command: '/opt/planted-command/tool',
          args: ['--token', 'planted-arg'],
          env: { API_KEY: 'planted-env' },
        },
      },
      projects: {
        [ctx.repo]: {
          mcpServers: { docs: { type: 'ws', url: 'wss://docs.example.test:8443/planted-socket' } },
        },
      },
    }),
  );

  const servers = await loadMCPServers(ctx.repo, { env: {}, home: ctx.dir });

  expect(servers).toStrictEqual([
    { name: 'docs', scope: 'local', transport: 'ws', host: 'docs.example.test:8443' },
    { name: 'linear', scope: 'user', transport: 'http', host: 'mcp.linear.app' },
    { name: 'tool', scope: 'user', transport: 'stdio', host: null },
  ]);

  expect(JSON.stringify(servers)).not.toInclude('planted');
});

test('it keeps one definition per server name, local before project before user', async () => {
  const ctx = await setupTest();

  await writeFile(
    join(ctx.repo, '.mcp.json'),
    JSON.stringify({
      mcpServers: {
        linear: { type: 'http', url: 'https://project.example.test/mcp' },
        docs: { type: 'http', url: 'https://docs-project.example.test/mcp' },
      },
    }),
  );

  await writeFile(
    join(ctx.dir, '.claude', 'settings.json'),
    JSON.stringify({ enableAllProjectMcpServers: true }),
  );

  await writeFile(
    join(ctx.dir, '.claude.json'),
    JSON.stringify({
      mcpServers: {
        linear: { type: 'http', url: 'https://user.example.test/mcp' },
        docs: { type: 'http', url: 'https://docs-user.example.test/mcp' },
      },
      projects: {
        [ctx.repo]: { mcpServers: { linear: { type: 'http', url: 'https://mcp.linear.app/mcp' } } },
      },
    }),
  );

  const servers = await loadMCPServers(ctx.repo, { env: {}, home: ctx.dir });

  expect(servers).toStrictEqual([
    { name: 'linear', scope: 'local', transport: 'http', host: 'mcp.linear.app' },
    { name: 'docs', scope: 'project', transport: 'http', host: 'docs-project.example.test' },
  ]);
});

test('it reads a nested checkout as its own project, not its parent', async () => {
  const ctx = await setupTest();

  const nested = join(ctx.repo, 'vendor', 'nested');

  await mkdir(join(nested, '.git'), { recursive: true });

  await writeFile(
    join(nested, '.mcp.json'),
    JSON.stringify({ mcpServers: { nested: { command: 'nested' } } }),
  );

  await writeFile(
    join(ctx.dir, '.claude', 'settings.json'),
    JSON.stringify({ enabledMcpjsonServers: ['nested'] }),
  );

  await writeFile(
    join(ctx.dir, '.claude.json'),
    JSON.stringify({ projects: { [ctx.repo]: { mcpServers: { parent: { command: 'parent' } } } } }),
  );

  const servers = await loadMCPServers(nested, { env: {}, home: ctx.dir });

  expect(servers).toStrictEqual([
    { name: 'nested', scope: 'project', transport: 'stdio', host: null },
  ]);
});

test('it lists a project server only when the user settings approve it, not the checkout', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.repo, '.claude'));

  await writeFile(
    join(ctx.repo, '.mcp.json'),
    JSON.stringify({
      mcpServers: {
        approved: { type: 'http', url: 'https://approved.example.test/mcp' },
        unapproved: { type: 'http', url: 'https://unapproved.example.test/mcp' },
      },
    }),
  );

  await writeFile(
    join(ctx.repo, '.claude', 'settings.json'),
    JSON.stringify({ enableAllProjectMcpServers: true }),
  );

  await writeFile(
    join(ctx.dir, '.claude', 'settings.json'),
    JSON.stringify({ enabledMcpjsonServers: ['approved'] }),
  );

  const servers = await loadMCPServers(join(ctx.repo, 'src'), { env: {}, home: ctx.dir });

  expect(servers).toStrictEqual([
    { name: 'approved', scope: 'project', transport: 'http', host: 'approved.example.test' },
  ]);
});

test('it drops a project server that the project entry disables, even when all are enabled', async () => {
  const ctx = await setupTest();

  await writeFile(
    join(ctx.repo, '.mcp.json'),
    JSON.stringify({
      mcpServers: {
        kept: { command: 'kept' },
        blocked: { command: 'blocked' },
      },
    }),
  );

  await writeFile(
    join(ctx.dir, '.claude', 'settings.json'),
    JSON.stringify({ enableAllProjectMcpServers: true }),
  );

  await writeFile(
    join(ctx.dir, '.claude.json'),
    JSON.stringify({ projects: { [ctx.repo]: { disabledMcpjsonServers: ['blocked'] } } }),
  );

  const servers = await loadMCPServers(ctx.repo, { env: {}, home: ctx.dir });

  expect(servers).toStrictEqual([
    { name: 'kept', scope: 'project', transport: 'stdio', host: null },
  ]);
});

test('it reads the Claude Code state in the directory CLAUDE_CONFIG_DIR names', async () => {
  const ctx = await setupTest();

  const configDir = join(ctx.dir, 'config');

  await mkdir(configDir);

  await writeFile(
    join(configDir, '.claude.json'),
    JSON.stringify({ mcpServers: { linear: { type: 'sse', url: 'https://mcp.linear.app/sse' } } }),
  );

  await writeFile(
    join(ctx.dir, '.claude.json'),
    JSON.stringify({ mcpServers: { ignored: { command: 'ignored' } } }),
  );

  const servers = await loadMCPServers(ctx.repo, {
    env: { CLAUDE_CONFIG_DIR: configDir },
    home: ctx.dir,
  });

  expect(servers).toStrictEqual([
    { name: 'linear', scope: 'user', transport: 'sse', host: 'mcp.linear.app' },
  ]);
});

test('it leaves the host unknown when the server URL holds an unexpanded variable', async () => {
  const ctx = await setupTest();

  await writeFile(
    join(ctx.dir, '.claude.json'),
    JSON.stringify({
      mcpServers: { api: { type: 'http', url: `https://\${API_HOST}/mcp` } },
    }),
  );

  const servers = await loadMCPServers(ctx.repo, { env: {}, home: ctx.dir });

  expect(servers).toStrictEqual([{ name: 'api', scope: 'user', transport: 'http', host: null }]);
});

test('it lists nothing when the Claude Code state is not JSON', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.dir, '.claude.json'), '{ not json');

  const servers = await loadMCPServers(ctx.repo, { env: {}, home: ctx.dir });

  expect(servers).toStrictEqual([]);
});
