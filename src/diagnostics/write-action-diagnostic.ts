import { createHash } from 'node:crypto';
import { appendFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { HostEnvironment, OutputStream } from '../config/types.ts';
import type { JudgeDiagnostics } from '../judge/types.ts';
import type { DecisionDiagnostics } from '../model/types.ts';
import type { ActionRequest, Verdict } from '../request/types.ts';
import { resolveXDGDir } from '../state/resolve-xdg-dir.ts';
import type { DecidingStage } from '../types.ts';

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
  readonly decidingStage?: DecidingStage;
  readonly denials?: { readonly consecutive: number; readonly session: number };
  readonly escalation?: boolean;
  readonly diagnostics?: DecisionDiagnostics;
  readonly judge?: JudgeDiagnostics;
  readonly grant?: JudgeDiagnostics;
}

export async function writeActionDiagnostic(
  payload: ActionRequest,
  entry: Readonly<ActionDiagnostic>,
  host: Readonly<HostEnvironment>,
  warnings: Readonly<OutputStream>,
): Promise<void> {
  const path =
    host.env['AUTO_MODE_DIAGNOSTICS_PATH'] ?? join(resolveXDGDir(host, 'state'), 'actions.jsonl');

  if (path === '') {
    return;
  }

  const agentID = payload.decisionContext?.agentID ?? null;

  // The main agent keys on the session alone, as a record of schema version 4
  // or lower does, so a session whose log holds both versions stays one agent.
  const agentKey = agentID === null ? payload.sessionID : `${payload.sessionID}\0${agentID}`;

  const record = {
    schemaVersion: 6,
    time: new Date().toISOString(),
    invocationID: entry.invocationID,
    sessionHash: toHash(payload.sessionID),
    agentHash: toHash(agentKey),
    actionHash: payload.toolUseID === undefined ? null : toHash(payload.toolUseID),
    status: entry.status,
    verdict: entry.verdict ?? null,
    decidingStage: entry.decidingStage ?? null,
    denials: entry.denials ?? null,
    escalation: entry.escalation ?? false,
    diagnostics: entry.diagnostics ?? null,
    judge: entry.judge ?? null,
    grant: entry.grant ?? null,
  };

  try {
    await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    await appendFile(path, `${JSON.stringify(record)}\n`, { mode: 0o600 });
  } catch {
    warnings.write('auto-mode: diagnostics unavailable\n');
  }
}

function toHash(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 16);
}
