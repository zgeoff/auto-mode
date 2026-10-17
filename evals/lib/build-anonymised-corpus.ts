import { collectIdentifiers } from './collect-identifiers.ts';
import { derivePlaceholder } from './derive-placeholder.ts';
import { makeStringRewriter } from './make-string-rewriter.ts';
import type { Rewriter } from './make-string-rewriter.ts';

export interface CapturedAction {
  readonly cwd: string;
  readonly request: unknown;
  readonly verdict: unknown;
  readonly decidingStage: string;
}

interface AnonymisedCase {
  readonly id: string;
  readonly source: 'recorded';
  readonly request: unknown;
  readonly recordedVerdict: unknown;
  readonly decidingStage: string;
}

export interface AnonymisedCorpus {
  readonly schemaVersion: 1;
  readonly cases: readonly AnonymisedCase[];
}

// The salt keys every placeholder, so one corpus maps a value to one
// placeholder while a corpus built with another salt cannot be joined to it.
export function buildAnonymisedCorpus(
  actions: readonly CapturedAction[],
  salt: string,
): AnonymisedCorpus {
  const identifiers = collectIdentifiers(actions);
  const rewrite = makeStringRewriter(identifiers, salt);

  return {
    schemaVersion: 1,
    cases: actions.map((action, index) => ({
      id: `recorded-${String(index + 1).padStart(4, '0')}`,
      source: 'recorded',
      request: toAnonymisedValue(action.request, null, rewrite, salt),
      recordedVerdict: toAnonymisedValue(action.verdict, null, rewrite, salt),
      decidingStage: action.decidingStage,
    })),
  };
}

const ID_FIELDS: Readonly<Record<string, string>> = {
  sessionID: 'session',
  toolUseID: 'tool',
  agentID: 'agent',
};

function toAnonymisedValue(
  value: unknown,
  key: string | null,
  rewrite: Rewriter,
  salt: string,
): unknown {
  if (typeof value === 'string') {
    const idKind = key === null ? undefined : ID_FIELDS[key];

    return idKind === undefined ? rewrite(value) : derivePlaceholder(idKind, value, salt);
  }

  if (Array.isArray(value)) {
    return value.map((item: unknown) => toAnonymisedValue(item, null, rewrite, salt));
  }

  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([field, item]) => [
        field,
        toAnonymisedValue(item, field, rewrite, salt),
      ]),
    );
  }

  return value;
}
