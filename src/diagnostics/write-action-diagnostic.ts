import { createHash } from 'node:crypto';
import { appendFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { DecidingStage } from '../classify-action.ts';
import type { HostEnvironment } from '../config/types.ts';
import type { DecisionDiagnostics } from '../model/types.ts';
import type { ActionRequest, Verdict } from '../request/types.ts';
import { resolveStateDir } from '../state/resolve-state-dir.ts';

interface ActionDiagnostic {
  readonly invocationID: string;
  readonly status:
    | 'started'
    | 'allow'
    | 'defer'
    | 'failure'
    | 'skipped'
    | DecisionDiagnostics['status'];
  readonly verdict?: Verdict['kind'] | 'defer';
  readonly decidingStage?: DecidingStage | 'budget';
  readonly denials?: { readonly consecutive: number; readonly session: number };
  readonly escalation?: boolean;
  readonly diagnostics?: DecisionDiagnostics;
}

export async function writeActionDiagnostic(
  payload: ActionRequest,
  entry: Readonly<ActionDiagnostic>,
  host: Readonly<HostEnvironment>,
): Promise<void> {
  const path =
    host.env['AUTO_MODE_DIAGNOSTICS_PATH'] ?? join(resolveStateDir(host), 'actions.jsonl');

  if (path === '') {
    return;
  }

  const record = {
    schemaVersion: 3,
    time: new Date().toISOString(),
    invocationID: entry.invocationID,
    sessionHash: toHash(payload.sessionID),
    actionHash: payload.toolUseID === undefined ? null : toHash(payload.toolUseID),
    status: entry.status,
    verdict: entry.verdict ?? null,
    decidingStage: entry.decidingStage ?? null,
    denials: entry.denials ?? null,
    escalation: entry.escalation ?? false,
    diagnostics: entry.diagnostics ?? null,
  };

  try {
    await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    await appendFile(path, `${JSON.stringify(record)}\n`, { mode: 0o600 });
  } catch {
    process.stderr.write('auto-mode: diagnostics unavailable\n');
  }
}

function toHash(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 16);
}
