import { createHash } from 'node:crypto';
import { appendFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { HostEnvironment, OutputStream } from '../config/types.ts';
import type { JudgeDiagnostics } from '../judge/types.ts';
import type { DecisionDiagnostics } from '../model/types.ts';
import type { ActionRequest, Verdict } from '../request/types.ts';
import { buildSecretFreeText } from '../secrets/build-secret-free-text.ts';
import { findSecret } from '../secrets/find-secret.ts';
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
  const isReviewed = entry.judge !== undefined || entry.grant !== undefined;

  const record = {
    schemaVersion: 9,
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
    judge: entry.judge === undefined ? null : buildLoggedReview(entry.judge),
    grant: entry.grant === undefined ? null : buildLoggedReview(entry.grant),
    action: isReviewed ? buildLoggedAction(payload) : null,
    taskEvidence: buildTaskEvidence(payload),
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

function buildLoggedReview(review: Readonly<JudgeDiagnostics>): JudgeDiagnostics {
  if (review.overturnReason === null) {
    return review;
  }

  const reason = buildSecretFreeText(review.overturnReason, () => '[secret]');

  return {
    ...review,
    overturnReason: findSecret({ text: reason, path: null }) === null ? reason : null,
  };
}

const LOGGED_INPUT_MAX_CHARS = 2000;

interface LoggedAction {
  readonly tool: string;
  readonly cwd: string;
  readonly input: string | null;
}

function buildLoggedAction(payload: ActionRequest): LoggedAction {
  const redacted = buildSecretFreeValue(payload.toolInput);
  const input = JSON.stringify(redacted);

  return {
    tool: payload.toolName,
    cwd: payload.cwd,
    input:
      hasSecret(redacted) || findSecret({ text: input, path: null }) !== null
        ? null
        : input.slice(0, LOGGED_INPUT_MAX_CHARS),
  };
}

// JSON escaping hides a quoted credential from the secret rules, so each
// string is scanned as written before the input is serialized.
function buildSecretFreeValue(value: unknown): unknown {
  if (typeof value === 'string') {
    return buildSecretFreeText(value, () => '[secret]');
  }

  if (Array.isArray(value)) {
    return value.map((item: unknown) => buildSecretFreeValue(item));
  }

  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]: [string, unknown]) => [
        key,
        buildSecretFreeValue(item),
      ]),
    );
  }

  return value;
}

function hasSecret(value: unknown): boolean {
  if (typeof value === 'string') {
    return findSecret({ text: value, path: null }) !== null;
  }

  if (Array.isArray(value)) {
    return value.some((item: unknown) => hasSecret(item));
  }

  if (typeof value === 'object' && value !== null) {
    return Object.values(value).some((item: unknown) => hasSecret(item));
  }

  return false;
}

interface TaskEvidence {
  readonly userMessage: 'current' | 'stale' | null;
  readonly originalUserTask: string | null;
  readonly delegatedTask: boolean;
}

function buildTaskEvidence(payload: ActionRequest): TaskEvidence | null {
  const context = payload.decisionContext;

  if (context === undefined) {
    return null;
  }

  const message = context.lastDirectUserMessage;

  return {
    userMessage: message === null ? null : (message.freshness ?? 'current'),
    originalUserTask: context.originalUserTask?.origin ?? null,
    delegatedTask: context.delegatedTask !== null,
  };
}
