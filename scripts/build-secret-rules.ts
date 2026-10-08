import { readFile, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import invariant from 'tiny-invariant';
import * as z from 'zod';
import type {
  FilterField,
  FilterTerm,
  SecretPattern,
  SecretRule,
  SecretRuleSet,
} from '../src/secrets/types.ts';

// Rules that backtrack quadratically under V8 on hostile input; they run on
// re2js, which matches in linear time, from their original RE2 source.
const RE2_RULES = new Set([
  'ebay-client-id',
  'auth0-domain.1',
  'snowflake-account-host.1',
  'curl-auth-user',
  'curl-auth-header',
]);

const ruleSchema = z.object({
  id: z.string(),
  regex: z.string().optional(),
  path: z.string().optional(),
  keywords: z.array(z.string()).optional(),
  secretGroup: z.number().int().optional(),
  filter: z.string().optional(),
  skipReport: z.boolean().optional(),
});

const configSchema = z.object({
  prefilter: z.string(),
  filter: z.string(),
  rules: z.array(ruleSchema),
});

interface Unported {
  readonly rule: string;
  readonly part: string;
}

async function main(): Promise<void> {
  const args = parseArgs({
    options: {
      config: { type: 'string' },
      license: { type: 'string' },
      version: { type: 'string' },
      commit: { type: 'string' },
      out: { type: 'string' },
    },
  }).values;

  invariant(
    args.config !== undefined &&
      args.license !== undefined &&
      args.version !== undefined &&
      args.commit !== undefined &&
      args.out !== undefined,
    'usage: build-secret-rules --config betterleaks.toml --license LICENSE --version v --commit sha --out rules.json',
  );

  const [toml, notice] = await Promise.all([
    readFile(args.config, 'utf8'),
    readFile(args.license, 'utf8'),
  ]);

  const config = configSchema.parse(Bun.TOML.parse(toml));
  const prefilter = parseFilter('prefilter', config.prefilter);
  const filter = parseFilter('filter', config.filter);
  const [pathFilter] = prefilter.terms;

  invariant(
    prefilter.terms.length === 1 && pathFilter?.kind === 'matches' && pathFilter.field === 'path',
    'the global prefilter is one path match',
  );

  const parsed = config.rules.map((rule) => ({
    rule: {
      id: rule.id,
      pattern: rule.regex === undefined ? null : buildRulePattern(rule.id, rule.regex),
      path: rule.path === undefined ? null : buildPattern(rule.path),
      keywords: [...new Set((rule.keywords ?? []).map((keyword) => keyword.toLowerCase()))],
      secretGroup: rule.secretGroup ?? 0,
      filter: [] as FilterTerm[],
      report: rule.skipReport !== true,
    } satisfies SecretRule,
    filter: rule.filter === undefined ? null : parseFilter(rule.id, rule.filter),
  }));

  const rules = parsed.map((entry) => ({ ...entry.rule, filter: entry.filter?.terms ?? [] }));

  const unported = [
    ...prefilter.unported,
    ...filter.unported,
    ...parsed.flatMap((entry) => entry.filter?.unported ?? []),
  ];

  const ruleSet: SecretRuleSet = {
    source: {
      repository: 'https://github.com/betterleaks/betterleaks',
      version: args.version,
      commit: args.commit,
    },
    notice,
    prefilter: pathFilter.patterns,
    filter: filter.terms,
    rules,
    unported,
  };

  await writeFile(args.out, `${JSON.stringify(ruleSet)}\n`);

  console.log(
    JSON.stringify({
      rules: rules.length,
      reported: rules.filter((rule) => rule.report).length,
      re2: rules.filter((rule) => rule.pattern?.engine === 're2').map((rule) => rule.id),
      unported: unported.length,
    }),
  );
}

// re2js is linear but slow, so the two curl rules run only on windows that
// open at each `curl`: their patterns start with `\bcurl\b` and span at most
// 11 newlines, five `[\r\n]{1,2}` repeats and one whitespace before the flag.
const CURL_WINDOW = { start: 'curl', maxNewlines: 11 };

function buildRulePattern(id: string, source: string): SecretPattern {
  if (!RE2_RULES.has(id)) {
    return buildPattern(source);
  }

  const window = source.startsWith(String.raw`\bcurl\b`) ? { window: CURL_WINDOW } : {};

  return { source, flags: '', engine: 're2', ...window };
}

function buildPattern(source: string): SecretPattern {
  const translated = toJSRegExpSource(source);

  // A pattern that fails to compile stops the build here.
  const compiled = new RegExp(translated.source, translated.flags);

  return { source: translated.source, flags: compiled.flags, engine: 'js' };
}

const POSIX_CLASSES: Readonly<Record<string, string>> = {
  alnum: 'a-zA-Z0-9',
  alpha: 'a-zA-Z',
  digit: '0-9',
  lower: 'a-z',
  upper: 'A-Z',
  space: String.raw`\s`,
  xdigit: '0-9a-fA-F',
  punct: String.raw`!-\/:-@\[-${'`'}{-~`,
  word: String.raw`\w`,
};

// RE2 and V8 read six constructs differently: leading flags, mid-pattern
// flags (which RE2 carries into later alternatives of the group), `(?P<`,
// `\z` (a literal z to V8), `\A`, and POSIX classes.
function toJSRegExpSource(input: string): { source: string; flags: string } {
  let source = input;
  let flags = '';
  const lead = /^\(\?(?<flags>[ims]+)\)/u.exec(source);

  if (lead !== null) {
    flags += lead.groups?.['flags'] ?? '';
    source = source.slice(lead[0].length);
  }

  for (let next = expandInlineFlag(source); next !== null; next = expandInlineFlag(source)) {
    source = next;
  }

  source = source
    .replaceAll('(?P<', '(?<')
    .replaceAll(String.raw`\z`, '$')
    .replaceAll(String.raw`\A`, '^')
    .replaceAll(/\[:(?<name>\w+):\]/gu, (whole, name: string) => POSIX_CLASSES[name] ?? whole);

  if (/\\x\{/u.test(source)) {
    source = source.replaceAll(/\\x\{(?<code>[0-9a-fA-F]+)\}/gu, String.raw`\u{$<code>}`);
    flags += 'u';
  }

  if (/\\[pP]\{/u.test(source) && !flags.includes('u')) {
    flags += 'u';
  }

  invariant(!source.includes(String.raw`\Q`), `untranslated \\Q in ${input}`);

  return { source, flags };
}

function expandInlineFlag(source: string): string | null {
  const match = findInlineFlag(source);

  if (match === null) {
    return null;
  }

  const body = match.start + match.length;
  const group = findGroupEnd(source, body);
  const cuts = [body, ...group.bars.map((bar) => bar + 1)];
  const ends = [...group.bars, group.end];
  const pieces = cuts.map((cut, index) => `(?${match.flags}:${source.slice(cut, ends[index])})`);

  return `${source.slice(0, match.start)}${pieces.join('|')}${source.slice(group.end)}`;
}

function findInlineFlag(source: string): { start: number; length: number; flags: string } | null {
  for (const match of source.matchAll(/\(\?(?<flags>[ims]+)\)/gu)) {
    if (!isEscaped(source, match.index)) {
      return { start: match.index, length: match[0].length, flags: match.groups?.['flags'] ?? '' };
    }
  }

  return null;
}

function isEscaped(source: string, index: number): boolean {
  let count = 0;

  for (let at = index - 1; at >= 0 && source[at] === '\\'; at -= 1) {
    count += 1;
  }

  return count % 2 === 1;
}

function findGroupEnd(source: string, from: number): { end: number; bars: number[] } {
  const bars: number[] = [];
  let depth = 0;
  let inClass = false;
  let index = from;

  for (; index < source.length; index += 1) {
    const char = source[index];

    if (char === '\\') {
      index += 1;
    } else if (inClass) {
      inClass = char !== ']';
    } else if (char === '[') {
      inClass = true;
      index += source[index + 1] === '^' ? 1 : 0;
      index += source[index + 1] === ']' ? 1 : 0;
    } else if (char === '(') {
      depth += 1;
    } else if (char === ')' && depth === 0) {
      break;
    } else if (char === ')') {
      depth -= 1;
    } else if (char === '|' && depth === 0) {
      bars.push(index);
    }
  }

  return { end: index, bars };
}

// Any true term drops the finding. A term outside the shapes below, such as
// one on a computed context, is left out, so the scanner reports more, never
// less; the token-ratio term needs a 1.1 MB tokenizer and never drops one.
function parseFilter(
  rule: string,
  expression: string,
): { terms: FilterTerm[]; unported: Unported[] } {
  const code = expression
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');

  const statements = splitTopLevel(code, ';').map((part) => part.trim());
  const bindings: Record<string, string> = {};

  for (const statement of statements.slice(0, -1)) {
    const binding = /^let\s+(?<name>\w+)\s*=\s*(?<value>[\s\S]+)$/u.exec(statement)?.groups;

    if (binding?.['name'] !== undefined && binding['value'] !== undefined) {
      bindings[binding['name']] = binding['value'];
    }
  }

  const terms: FilterTerm[] = [];
  const unported: Unported[] = [];

  for (const part of collectDisjuncts(statements.at(-1) ?? '', bindings)) {
    const term = parseFilterTerm(part);

    if (term === 'token-ratio' || term === null) {
      unported.push({ rule, part: term === null ? part.slice(0, 80) : 'tokenRatio' });
    } else {
      terms.push(term);
    }
  }

  return { terms, unported };
}

// A bare name in the disjunction stands for its `let` binding, which ports
// when its own expression does.
function collectDisjuncts(
  expression: string,
  bindings: Readonly<Record<string, string>>,
): string[] {
  const parts = splitTopLevel(normalizeParens(expression.trim()), '||');

  if (parts.length > 1) {
    return parts.flatMap((part) => collectDisjuncts(part, bindings));
  }

  const part = normalizeParens(parts[0]?.trim() ?? '');
  const bound = Object.hasOwn(bindings, part) ? bindings[part] : undefined;

  return bound === undefined ? [part] : collectDisjuncts(bound, bindings);
}

const ENTROPY_TERM =
  /^(?:filter\.)?entropy\(finding\["secret"\]\)\s*(?<op><=|<)\s*(?<value>[\d.]+)$/u;

const TOKEN_RATIO_TERM = /^(?:filter\.)?tokenRatio\(finding\["secret"\]\)\s*>=\s*[\d.]+$/u;

const LIST_TERM =
  /^(?<negate>!?)(?:filter\.)?(?<kind>matchesAny|containsAny)\((?:finding|attributes)\["(?<field>secret|match|line|path)"\],\s*\[(?<items>[\s\S]*)\]\)$/u;

const FILTER_FIELDS: readonly FilterField[] = ['secret', 'match', 'line', 'path'];

function parseFilterTerm(term: string): FilterTerm | 'token-ratio' | null {
  const entropy = ENTROPY_TERM.exec(term)?.groups;

  if (entropy !== undefined) {
    return {
      kind: 'entropy',
      op: entropy['op'] === '<' ? '<' : '<=',
      value: Number(entropy['value']),
    };
  }

  if (TOKEN_RATIO_TERM.test(term)) {
    return 'token-ratio';
  }

  const list = LIST_TERM.exec(term)?.groups;
  const field = FILTER_FIELDS.find((candidate) => candidate === list?.['field']);
  const items = list === undefined ? null : splitListItems(list['items'] ?? '');

  if (list === undefined || field === undefined || items === null) {
    return null;
  }

  const negate = list['negate'] === '!';

  return list['kind'] === 'containsAny'
    ? { kind: 'contains', field, values: items, negate }
    : { kind: 'matches', field, patterns: items.map((item) => buildPattern(item)), negate };
}

// Items are backtick raw strings or double-quoted strings, comma separated.
function splitListItems(text: string): string[] | null {
  const items: string[] = [];
  const item = /\s*(?:`(?<raw>[^`]*)`|(?<quoted>"(?:[^"\\]|\\.)*"))\s*(?:,|$)/uy;
  const end = text.trimEnd().length;

  for (item.lastIndex = 0; item.lastIndex < end;) {
    const groups = item.exec(text)?.groups;

    if (groups === undefined) {
      return null;
    }

    items.push(groups['raw'] ?? z.string().parse(JSON.parse(groups['quoted'] ?? '""')));
  }

  return items;
}

function normalizeParens(text: string): string {
  return text.startsWith('(') && findClosingParen(text) === text.length - 1
    ? text.slice(1, -1).trim()
    : text;
}

function findClosingParen(text: string): number {
  let depth = 0;
  let quote: string | null = null;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index] ?? '';

    if (quote !== null) {
      index += char === '\\' && quote === '"' ? 1 : 0;
      quote = char === quote ? null : quote;
    } else if (char === '`' || char === '"') {
      quote = char;
    } else if (char === '(') {
      depth += 1;
    } else if (char === ')') {
      depth -= 1;

      if (depth === 0) {
        return index;
      }
    }
  }

  return -1;
}

function splitTopLevel(text: string, separator: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let start = 0;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index] ?? '';

    if (quote !== null) {
      index += char === '\\' && quote === '"' ? 1 : 0;
      quote = char === quote ? null : quote;
    } else if (char === '`' || char === '"') {
      quote = char;
    } else if ('([{'.includes(char)) {
      depth += 1;
    } else if (')]}'.includes(char)) {
      depth -= 1;
    } else if (depth === 0 && text.startsWith(separator, index)) {
      parts.push(text.slice(start, index));

      start = index + separator.length;
      index += separator.length - 1;
    }
  }

  parts.push(text.slice(start));

  return parts.filter((part) => part.trim() !== '');
}

await main();
