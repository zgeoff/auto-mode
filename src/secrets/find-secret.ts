import { Buffer } from 'node:buffer';
import { RE2JS } from 're2js';
import { getSecretRuleSet } from './get-secret-rule-set.ts';
import type { FilterField, FilterTerm, SecretPattern, SecretRule } from './types.ts';

export interface SecretContent {
  readonly text: string;
  readonly path: string | null;
}

export interface SecretFinding {
  readonly rule: string;
  readonly secret: string;
}

const RULE_SET = getSecretRuleSet();

// A rule that Betterleaks never reports alone names a part of a composite
// secret, such as a client ID; the composite's own rule reports without it.
const REPORTED_RULES = RULE_SET.rules.filter((rule) => rule.report);

export function findSecret(
  content: Readonly<SecretContent>,
  rules: readonly SecretRule[] = REPORTED_RULES,
): SecretFinding | null {
  const path = content.path;

  if (path !== null && RULE_SET.prefilter.some((pattern) => hasPatternMatch(pattern, path))) {
    return null;
  }

  const lower = content.text.toLowerCase();

  for (const rule of rules) {
    const hasKeyword =
      rule.keywords.length === 0 || rule.keywords.some((keyword) => lower.includes(keyword));

    const finding = hasKeyword ? findRuleSecret(rule, content) : null;

    if (finding !== null) {
      return finding;
    }
  }

  return null;
}

function findRuleSecret(
  rule: Readonly<SecretRule>,
  content: Readonly<SecretContent>,
): SecretFinding | null {
  const path = content.path ?? '';

  if (rule.path !== null && !hasPatternMatch(rule.path, path)) {
    return null;
  }

  if (rule.pattern === null) {
    return rule.path === null ? null : { rule: rule.id, secret: path };
  }

  for (const match of collectMatches(rule.pattern, content.text)) {
    const matched = match.text.replaceAll(/^\n+|\n+$/gu, '');
    const secret = matched === '' ? null : pickSecret(rule, rule.pattern, matched);

    const fields =
      secret === null
        ? null
        : { secret, match: matched, line: getLine(content.text, match.start, match.end), path };

    if (
      fields !== null &&
      !isFiltered(RULE_SET.filter, fields) &&
      !isFiltered(rule.filter, fields)
    ) {
      return { rule: rule.id, secret: fields.secret };
    }
  }

  return null;
}

interface PatternMatch {
  readonly text: string;
  readonly start: number;
  readonly end: number;
}

function* collectMatches(pattern: Readonly<SecretPattern>, text: string): Generator<PatternMatch> {
  if (pattern.engine === 're2') {
    for (const window of collectWindows(pattern, text)) {
      const matcher = getRE2(pattern).matcher(text.slice(window.start, window.end));

      while (matcher.find()) {
        const start = window.start + matcher.start();

        yield { text: matcher.group() ?? '', start, end: window.start + matcher.end() };
      }
    }

    return;
  }

  const expression = new RegExp(getRegExp(pattern).source, `${pattern.flags}g`);

  for (let match = expression.exec(text); match !== null; match = expression.exec(text)) {
    if (match[0] === '') {
      expression.lastIndex += 1;
    } else {
      yield { text: match[0], start: match.index, end: match.index + match[0].length };
    }
  }
}

// A window opens at each occurrence of its start text and closes before the
// newline its pattern cannot cross; overlapping windows merge.
function collectWindows(
  pattern: Readonly<SecretPattern>,
  text: string,
): { start: number; end: number }[] {
  if (pattern.window === undefined) {
    return [{ start: 0, end: text.length }];
  }

  const opener = pattern.window.start;
  const maxNewlines = pattern.window.maxNewlines;
  const windows: { start: number; end: number }[] = [];

  for (let at = text.indexOf(opener); at !== -1; at = text.indexOf(opener, at + 1)) {
    let end = at;

    for (let count = 0; count <= maxNewlines && end !== -1; count += 1) {
      end = text.indexOf('\n', end + 1);
    }

    const close = end === -1 ? text.length : end;
    const last = windows.at(-1);

    if (last !== undefined && at <= last.end) {
      last.end = Math.max(last.end, close);
    } else {
      windows.push({ start: at, end: close });
    }
  }

  return windows;
}

// Betterleaks matches the rule again on the matched text and takes the
// configured group, or else the first group that matched anything.
function pickSecret(
  rule: Readonly<SecretRule>,
  pattern: Readonly<SecretPattern>,
  matched: string,
): string | null {
  const groups = collectGroups(pattern, matched);

  if (groups.length === 0) {
    return matched;
  }

  if (rule.secretGroup > 0) {
    return groups[rule.secretGroup - 1] ?? null;
  }

  return groups.find((group) => group !== '') ?? matched;
}

function collectGroups(pattern: Readonly<SecretPattern>, text: string): string[] {
  if (pattern.engine === 're2') {
    const matcher = getRE2(pattern).matcher(text);

    if (!matcher.find()) {
      return [];
    }

    return Array.from(
      { length: matcher.groupCount() },
      (_, index) => matcher.group(index + 1) ?? '',
    );
  }

  const match = getRegExp(pattern).exec(text);

  return match === null ? [] : match.slice(1).map((group) => group ?? '');
}

function getLine(text: string, start: number, end: number): string {
  const lineStart = text.lastIndexOf('\n', start - 1) + 1;
  const lineEnd = text.indexOf('\n', end);
  const close = lineEnd === -1 ? text.length : lineEnd;

  return text.slice(lineStart, close);
}

function isFiltered(
  terms: readonly FilterTerm[],
  fields: Readonly<Record<FilterField, string>>,
): boolean {
  return terms.some((term) => {
    if (term.kind === 'entropy') {
      const entropy = countEntropy(fields.secret);

      return term.op === '<' ? entropy < term.value : entropy <= term.value;
    }

    const value = fields[term.field];

    const hit =
      term.kind === 'contains'
        ? term.values.some((needle) => value.includes(needle))
        : term.patterns.some((pattern) => hasPatternMatch(pattern, value));

    return term.negate ? !hit : hit;
  });
}

// Betterleaks counts code points but divides by the UTF-8 byte length.
function countEntropy(text: string): number {
  if (text === '') {
    return 0;
  }

  const counts = new Map<string, number>();

  for (const char of text) {
    counts.set(char, (counts.get(char) ?? 0) + 1);
  }

  const length = Buffer.byteLength(text, 'utf8');
  let entropy = 0;

  for (const count of counts.values()) {
    const frequency = count / length;

    entropy -= frequency * Math.log2(frequency);
  }

  return entropy;
}

function hasPatternMatch(pattern: Readonly<SecretPattern>, text: string): boolean {
  return pattern.engine === 're2'
    ? getRE2(pattern).matcher(text).find()
    : getRegExp(pattern).test(text);
}

const compiledRegExps = new WeakMap<SecretPattern, RegExp>();
const compiledRE2 = new WeakMap<SecretPattern, RE2JS>();

function getRegExp(pattern: Readonly<SecretPattern>): RegExp {
  const cached = compiledRegExps.get(pattern);

  if (cached !== undefined) {
    return cached;
  }

  const compiled = new RegExp(pattern.source, pattern.flags);

  compiledRegExps.set(pattern, compiled);

  return compiled;
}

function getRE2(pattern: Readonly<SecretPattern>): RE2JS {
  const cached = compiledRE2.get(pattern);

  if (cached !== undefined) {
    return cached;
  }

  const compiled = RE2JS.compile(pattern.source);

  compiledRE2.set(pattern, compiled);

  return compiled;
}
