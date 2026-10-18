import { collectIdentifiers } from './collect-identifiers.ts';
import { derivePlaceholder } from './derive-placeholder.ts';
import { makeQuoteRemover } from './make-quote-remover.ts';
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
  const rewriteNames = makeStringRewriter(identifiers, salt);

  return {
    schemaVersion: 1,
    cases: actions.map((action, index) => {
      const removeQuotes = makeQuoteRemover(collectMessages(action.request, null), salt);
      const toAnonymisedText: Rewriter = (text) => rewriteNames(removeQuotes(text));

      return {
        id: `recorded-${String(index + 1).padStart(4, '0')}`,
        source: 'recorded',
        request: toAnonymisedValue(action.request, null, toAnonymisedText, salt),
        recordedVerdict: toAnonymisedValue(action.verdict, null, toAnonymisedText, salt),
        decidingStage: action.decidingStage,
      };
    }),
  };
}

// No pattern removes a person's words, so the text of each field that holds
// what a person typed becomes a placeholder, which a reader replaces with
// invented text.
const MESSAGE_FIELDS = new Set(['originalUserTask', 'delegatedTask', 'lastDirectUserMessage']);

function collectMessages(value: unknown, key: string | null): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item: unknown) => collectMessages(item, null));
  }

  if (typeof value !== 'object' || value === null) {
    return [];
  }

  const text: unknown = 'text' in value ? value.text : undefined;
  const own = key !== null && MESSAGE_FIELDS.has(key) && typeof text === 'string' ? [text] : [];

  return [
    ...own,
    ...Object.entries(value).flatMap(([field, item]) => collectMessages(item, field)),
  ];
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
    const isMessage = key !== null && MESSAGE_FIELDS.has(key);

    return Object.fromEntries(
      Object.entries(value).map(([field, item]) => [
        field,
        isMessage && field === 'text' && typeof item === 'string'
          ? derivePlaceholder('message', item, salt)
          : toAnonymisedValue(item, field, rewrite, salt),
      ]),
    );
  }

  return value;
}
