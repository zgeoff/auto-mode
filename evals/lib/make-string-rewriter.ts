import { findSecret } from 'auto-mode/eval';
import { derivePlaceholder } from './derive-placeholder.ts';
import {
  EMAIL,
  HOME_PATH,
  KEPT_ADDRESSES,
  SCP_REMOTE,
  SHARED_USERS,
  URL_AUTHORITY,
  WINDOWS_HOME,
} from './identifier-patterns.ts';
import type { Groups, IdentifierClass } from './identifier-patterns.ts';

export type Rewriter = (text: string) => string;

const QUERY_VALUE = /(?<prefix>[?&][\w.~-]+=)(?<value>[^&#\s"'<>]+)/gu;

const SECRET_FLAG =
  /(?<flag>--(?:password|passwd|pass|token|secret|api-key|apikey|auth|auth-token)(?:=|\s+))(?<value>[^\s"'&;|]+)/giu;

const ATTACHED_PASSWORD = /(?<flag>(?<![\w-])-p)(?<value>[^\s"'&;|]*[A-Za-z][^\s"'&;|]*)/gu;
const IPV4 = /(?<![\w.])(?:\d{1,3}\.){3}\d{1,3}(?![\w.])/gu;
const IPV6 = /(?<![\w:])[0-9A-Fa-f]{0,4}(?::[0-9A-Fa-f]{0,4}){2,7}(?![\w:])/gu;
const PRIVATE_KEY = /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/gu;

const KNOWN_TOKEN =
  /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_\w{20,}|sk-[\w-]{20,}|xox[abposr]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16}|glpat-[\w-]{20,}|npm_[A-Za-z0-9]{36}|eyJ[\w-]+\.[\w-]+\.[\w-]+)/gu;

const LONG_RUN = /(?<![\w+=-])[\w+=-]{32,}(?![\w+=-])/gu;

const SECRET_ASSIGNMENT =
  /\b(?<name>[A-Za-z_][\w-]*(?:key|token|secret|password|passwd|pwd|credential|auth)[\w-]*)(?<separator>\s*[=:]\s*["']?)(?<value>[^\s"'&;|]{6,})/giu;

const AUTH_SCHEME = /\b(?<scheme>Bearer|Basic)\s+(?<value>[\w.~+/=-]{8,})/gu;

export function makeStringRewriter(
  identifiers: Readonly<Record<string, IdentifierClass>>,
  salt: string,
): Rewriter {
  const toPlaceholder = (kind: string, value: string): string =>
    derivePlaceholder(kind, value, salt);

  const toClassedPlaceholder = (fallback: IdentifierClass, value: string): string => {
    const key = value.toLowerCase();
    const kind = Object.hasOwn(identifiers, key) ? (identifiers[key] ?? fallback) : fallback;

    return toPlaceholder(kind, value);
  };

  const names = Object.keys(identifiers)
    .toSorted((a, b) => b.length - a.length)
    .map((name) => name.replaceAll(/[.*+?^${}()|[\]\\]/gu, String.raw`\$&`));

  const identifierPattern =
    names.length === 0
      ? null
      : new RegExp(`(?<![A-Za-z0-9])(?:${names.join('|')})(?![A-Za-z0-9])`, 'giu');

  // The URL pass runs first because it drops a password in the user info
  // whole, which a token pass would otherwise split from its URL.
  const steps: readonly Rewriter[] = [
    (text) =>
      buildReplacedText(text, URL_AUTHORITY, (_match, groups) => {
        const userinfo = groups['userinfo']?.split(':')[0];
        const host = groups['host'] ?? '';

        if (KEPT_ADDRESSES.has(host)) {
          return _match;
        }

        const user =
          userinfo === undefined
            ? ''
            : `${SHARED_USERS.has(userinfo) ? userinfo : toClassedPlaceholder('user', userinfo)}@`;

        const first = groups['first'];
        const second = groups['second'];
        const firstPart = first === undefined ? '' : `/${toClassedPlaceholder('owner', first)}`;

        const secondPart =
          second === undefined
            ? ''
            : `/${toClassedPlaceholder('repo', second.replace(/\.git$/u, ''))}${second.endsWith('.git') ? '.git' : ''}`;

        return `${groups['scheme'] ?? ''}${user}${toClassedPlaceholder('host', host)}.example${groups['port'] ?? ''}${firstPart}${secondPart}`;
      }),
    (text) =>
      buildReplacedText(
        text,
        QUERY_VALUE,
        (_match, groups) =>
          `${groups['prefix'] ?? ''}${toPlaceholder('token', groups['value'] ?? '')}`,
      ),
    (text) =>
      buildReplacedText(
        text,
        SECRET_FLAG,
        (_match, groups) =>
          `${groups['flag'] ?? ''}${toPlaceholder('token', groups['value'] ?? '')}`,
      ),
    (text) =>
      buildReplacedText(
        text,
        ATTACHED_PASSWORD,
        (_match, groups) =>
          `${groups['flag'] ?? ''}${toPlaceholder('token', groups['value'] ?? '')}`,
      ),
    (text) => buildReplacedText(text, PRIVATE_KEY, (match) => toPlaceholder('token', match)),
    (text) => buildSecretFreeText(text, (secret) => toPlaceholder('token', secret)),
    (text) => buildReplacedText(text, KNOWN_TOKEN, (match) => toPlaceholder('token', match)),
    (text) =>
      buildReplacedText(text, LONG_RUN, (match) =>
        isTokenLike(match) ? toPlaceholder('token', match) : match,
      ),
    (text) =>
      buildReplacedText(
        text,
        SECRET_ASSIGNMENT,
        (_match, groups) =>
          `${groups['name'] ?? ''}${groups['separator'] ?? ''}${toPlaceholder('token', groups['value'] ?? '')}`,
      ),
    (text) =>
      buildReplacedText(
        text,
        AUTH_SCHEME,
        (_match, groups) =>
          `${groups['scheme'] ?? ''} ${toPlaceholder('token', groups['value'] ?? '')}`,
      ),
    (text) =>
      buildReplacedText(text, SCP_REMOTE, (_match, groups) => {
        const user = groups['user'] ?? '';
        const shown = SHARED_USERS.has(user) ? user : toClassedPlaceholder('user', user);

        return `${shown}@${toClassedPlaceholder('host', groups['host'] ?? '')}.example:`;
      }),
    (text) =>
      buildReplacedText(text, EMAIL, (match) => `${toPlaceholder('email', match)}@example.invalid`),
    (text) =>
      buildReplacedText(
        text,
        WINDOWS_HOME,
        (_match, groups) =>
          `${groups['prefix'] ?? ''}${toClassedPlaceholder('user', groups['user'] ?? '')}`,
      ),
    (text) =>
      buildReplacedText(text, IPV4, (match) =>
        KEPT_ADDRESSES.has(match) ? match : toPlaceholder('host', match),
      ),
    (text) =>
      buildReplacedText(text, IPV6, (match) =>
        KEPT_ADDRESSES.has(match) ||
        (!match.includes('::') && match.split(':').length < 8) ||
        !/\d/u.test(match)
          ? match
          : toPlaceholder('host', match),
      ),
    (text) =>
      buildReplacedText(
        text,
        HOME_PATH,
        (_match, groups) =>
          `/${groups['base'] ?? ''}/${toClassedPlaceholder('user', groups['user'] ?? '')}`,
      ),
    (text) =>
      identifierPattern === null
        ? text
        : buildReplacedText(text, identifierPattern, (match) =>
            toClassedPlaceholder('repo', match),
          ),
  ];

  return (text) => steps.reduce((current, step) => step(current), text);
}

const PLACEHOLDER =
  /(?<placeholder>(?:user|host|owner|repo|branch|token|email|session|tool|agent|message)-[0-9a-f]{8})/u;

// A placeholder is split out before each pass, so no later pass rewrites a
// value an earlier one already replaced.
function buildReplacedText(
  text: string,
  pattern: Readonly<RegExp>,
  replacer: (match: string, groups: Groups) => string,
): string {
  return text
    .split(PLACEHOLDER)
    .map((part, index) =>
      index % 2 === 1
        ? part
        : part.replace(pattern, (...args: readonly unknown[]) => {
            const last = args.at(-1);
            const groups = isGroups(last) ? last : {};

            return replacer(String(args[0]), groups);
          }),
    )
    .join('');
}

function isGroups(value: unknown): value is Groups {
  return typeof value === 'object' && value !== null;
}

const MAX_SECRET_PASSES = 50;

function buildSecretFreeText(text: string, toReplacement: (secret: string) => string): string {
  let current = text;

  for (let pass = 0; pass < MAX_SECRET_PASSES; pass += 1) {
    const finding = findSecret({ text: current, path: null });

    if (finding === null || finding.secret === '' || !current.includes(finding.secret)) {
      return current;
    }

    current = current.replaceAll(finding.secret, toReplacement(finding.secret));
  }

  return current;
}

function isTokenLike(run: string): boolean {
  return /^[0-9a-f]+$/iu.test(run) || (/[A-Z]/u.test(run) && /[a-z]/u.test(run) && /\d/u.test(run));
}
