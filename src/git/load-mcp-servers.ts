import { join, resolve } from 'node:path';
import * as z from 'zod';
import { resolveClaudeConfigPath } from '../config/resolve-claude-config-path.ts';
import type { HostEnvironment } from '../config/types.ts';
import { loadJSONFile } from '../state/load-json-file.ts';
import type { MCPServerFact } from '../types.ts';
import { readCheckout } from './read-checkout.ts';
import type { CheckoutFacts } from './types.ts';

const serversSchema = z.record(z.string(), z.unknown()).optional();

const approvalSchema = z.looseObject({
  enableAllProjectMcpServers: z.boolean().optional(),
  enabledMcpjsonServers: z.array(z.string()).optional(),
  disabledMcpjsonServers: z.array(z.string()).optional(),
});

const stateSchema = z.looseObject({
  mcpServers: serversSchema,
  projects: z
    .record(z.string(), z.looseObject({ ...approvalSchema.shape, mcpServers: serversSchema }))
    .optional(),
});

const projectFileSchema = z.looseObject({ mcpServers: serversSchema });

export async function loadMCPServers(
  cwd: string,
  host: Readonly<HostEnvironment>,
  userSettings: unknown,
  checkoutFacts?: Readonly<CheckoutFacts>,
): Promise<MCPServerFact[]> {
  const state = await loadJSONFile(
    resolveClaudeConfigPath(host, '.claude.json'),
    stateSchema,
    null,
  );

  const settings = approvalSchema.safeParse(userSettings).data;

  // Claude Code keys a project by the top level of the checkout it runs in, so a
  // nested checkout never takes its parent's entry.
  const directory = resolve(cwd);

  const checkout =
    checkoutFacts === undefined ? await readCheckout(directory, host.env) : checkoutFacts.checkout;

  const projectDir = checkout?.worktree ?? directory;
  const project = state?.projects?.[projectDir];

  const projectFile = await loadJSONFile(join(projectDir, '.mcp.json'), projectFileSchema, null);

  const approvals = [settings, project].filter((entry) => entry !== undefined && entry !== null);

  const isDisabled = (name: string) =>
    approvals.some((entry) => entry.disabledMcpjsonServers?.includes(name) === true);

  const isEnabled = (name: string) =>
    approvals.some(
      (entry) =>
        entry.enableAllProjectMcpServers === true ||
        entry.enabledMcpjsonServers?.includes(name) === true,
    );

  // Claude Code runs one definition per name, local before project before user.
  const facts = [
    ...buildServerFacts(project?.mcpServers, 'local'),
    ...buildServerFacts(projectFile?.mcpServers, 'project').filter(
      (server) => isEnabled(server.name) && !isDisabled(server.name),
    ),
    ...buildServerFacts(state?.mcpServers, 'user'),
  ];

  return facts.filter(
    (server, index) => facts.findIndex((other) => other.name === server.name) === index,
  );
}

const MAX_NAME_LENGTH = 128;

const TRANSPORTS: Readonly<Record<string, MCPServerFact['transport']>> = {
  stdio: 'stdio',
  http: 'http',
  'streamable-http': 'http',
  sse: 'sse',
  ws: 'ws',
};

const serverSchema = z.looseObject({ type: z.string().optional(), url: z.string().optional() });

function buildServerFacts(
  servers: Readonly<Record<string, unknown>> | undefined,
  scope: MCPServerFact['scope'],
): MCPServerFact[] {
  return Object.entries(servers ?? {}).flatMap(([name, entry]) => {
    const server = serverSchema.safeParse(entry);

    if (!server.success || name === '' || name.length > MAX_NAME_LENGTH) {
      return [];
    }

    const transport =
      TRANSPORTS[server.data.type ?? (server.data.url === undefined ? 'stdio' : '')];

    if (transport === undefined) {
      return [];
    }

    const endpoint =
      transport === 'stdio' || server.data.url === undefined
        ? null
        : findEndpointHost(server.data.url);

    return [{ name, scope, transport, host: endpoint }];
  });
}

// A URL can carry a token in its user info, path or query, and an unexpanded
// `${VAR}` host names no real host.
function findEndpointHost(url: string): string | null {
  const parsed = URL.parse(url);

  if (
    parsed === null ||
    !/^(?:https?|wss?):$/u.test(parsed.protocol) ||
    /[${}]/u.test(parsed.host)
  ) {
    return null;
  }

  return parsed.host;
}
