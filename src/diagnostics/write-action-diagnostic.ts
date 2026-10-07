import { createHash } from 'node:crypto';
import { appendFile, mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import type { DecisionDiagnostics } from '../model/types.ts';
import type { ActionRequest, Verdict } from '../request/types.ts';

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
  readonly diagnostics?: DecisionDiagnostics;
}

export async function writeActionDiagnostic(
  payload: ActionRequest,
  entry: Readonly<ActionDiagnostic>,
): Promise<void> {
  const stateHome = process.env['XDG_STATE_HOME'];

  const stateDir =
    stateHome === undefined || stateHome === '' ? join(homedir(), '.local', 'state') : stateHome;

  const path =
    process.env['AUTO_MODE_DIAGNOSTICS_PATH'] ?? join(stateDir, 'auto-mode', 'actions.jsonl');

  if (path === '') {
    return;
  }

  const record = {
    schemaVersion: 2,
    time: new Date().toISOString(),
    invocationID: entry.invocationID,
    sessionHash: toHash(payload.sessionID),
    actionHash: payload.toolUseID === undefined ? null : toHash(payload.toolUseID),
    status: entry.status,
    verdict: entry.verdict ?? null,
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
