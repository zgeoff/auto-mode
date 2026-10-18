import { readFile, readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { parseArgs } from 'node:util';
import invariant from 'tiny-invariant';
import { isToolInput } from '../mods/auto-mode/hooks/is-tool-input.ts';
import { buildInventedCorpusMessages } from './build-invented-corpus-messages.ts';

// The report prints counts, case IDs and field names only, so it never
// repeats a recorded message or a name it searched for.

const INVENTED_CORPUS_MESSAGES = buildInventedCorpusMessages();
const ROOT = join(import.meta.dirname, '..');

const CASE_FILES = [
  ['decision-rules/real-traffic.json', INVENTED_CORPUS_MESSAGES.realTraffic],
  ['question-severity/cases.json', INVENTED_CORPUS_MESSAGES.questionSeverity],
  ['default-branch-write/cases.json', INVENTED_CORPUS_MESSAGES.defaultBranchWrite],
] as const;

const SECOND_JUDGE_FILE = 'second-judge/cases.json';

async function main(): Promise<void> {
  const args = parseArgs({
    options: { base: { type: 'string' }, names: { type: 'string' } },
  }).values;

  invariant(
    args.base !== undefined && args.names !== undefined,
    'usage: check-corpus-rewrite --base <git ref> --names <file with one term per line>',
  );

  const base = args.base;
  const baseMessages: string[] = [];

  print('1. Rewritten message fields that differ from the base');

  for (const [path, assignments] of CASE_FILES) {
    const baseText = await readBaseFile(base, `evals/corpora/${path}`);
    const headText = await readHeadFile(`evals/corpora/${path}`);

    const before = toCaseMessages(baseText);
    const after = toCaseMessages(headText);
    const ids = Object.keys(assignments);
    const changed = ids.filter((id) => before.get(id) !== after.get(id));

    baseMessages.push(...ids.flatMap((id) => [before.get(id) ?? '']));

    print(`   ${path}: ${changed.length} of ${ids.length} differ`);
  }

  const sjBaseText = await readBaseFile(base, `evals/corpora/${SECOND_JUDGE_FILE}`);
  const sjHeadText = await readHeadFile(`evals/corpora/${SECOND_JUDGE_FILE}`);

  const sjBefore = toMessageBank(sjBaseText);
  const sjAfter = toMessageBank(sjHeadText);
  const sjKeys = Object.keys(INVENTED_CORPUS_MESSAGES.secondJudge);
  const sjChanged = sjKeys.filter((key) => sjBefore.get(key) !== sjAfter.get(key));

  baseMessages.push(...sjKeys.flatMap((key) => [sjBefore.get(key) ?? '']));

  print(`   ${SECOND_JUDGE_FILE} messages: ${sjChanged.length} of ${sjKeys.length} differ`);

  const originals = [...new Set(baseMessages.filter((message) => message !== ''))];

  const files = [
    ...(await collectFiles(join(ROOT, 'evals/corpora'))),
    ...(await collectFiles(join(ROOT, 'docs'))),
  ];

  const texts = await Promise.all(files.map((file) => readFile(file, 'utf8')));

  print('');

  print(
    `2. Recorded messages that survive whole (${originals.length} distinct, ${files.length} files)`,
  );

  const whole = originals.filter((message) =>
    texts.some(
      (text) => text.includes(message) || text.includes(JSON.stringify(message).slice(1, -1)),
    ),
  );

  print(`   messages found whole in a head file: ${whole.length}`);
  print('');
  print('   Longest run of words a head string shares with a recorded message, per file and field');
  print('   (words hold no path; runs of 1 to 3 words are common English and are not listed)');

  const windows = buildWindowSets(originals);

  for (const [index, file] of files.entries()) {
    const longest = new Map<string, number>();

    for (const [field, value] of collectStrings(parseFile(file, texts[index] ?? ''), '')) {
      const run = countLongestRun(splitWords(value), windows);

      if (run >= 4) {
        longest.set(field, Math.max(longest.get(field) ?? 0, run));
      }
    }

    if (longest.size > 0) {
      const fields = [...longest].map(([field, run]) => `${field}=${run}`).join(' ');

      print(`   ${relative(ROOT, file)}: ${fields}`);
    }
  }

  const termsText = await readFile(args.names, 'utf8');

  const terms = termsText
    .split('\n')
    .map((term) => term.trim().toLowerCase())
    .filter((term) => term !== '');

  const searched = [
    ...files,
    ...(await collectFiles(join(ROOT, 'evals/lib'))),
    ...(await collectFiles(join(ROOT, 'scripts'))),
  ];

  const searchedRaw = await Promise.all(searched.map((file) => readFile(file, 'utf8')));

  const searchedTexts = searchedRaw.map((text) => text.toLowerCase());
  const areas = ['evals/corpora', 'docs', 'evals/lib', 'scripts'];

  print('');
  print(`3. Matches of each searched term, per folder (${searched.length} files)`);

  for (const [index, term] of terms.entries()) {
    const counts = areas.map((area) => {
      const count = searched.reduce((total, file, fileIndex) => {
        const text = searchedTexts[fileIndex] ?? '';
        const inArea = relative(ROOT, file).startsWith(`${area}/`);

        return inArea ? total + text.split(term).length - 1 : total;
      }, 0);

      return `${area}=${count}`;
    });

    print(`   term ${index + 1}: ${counts.join(' ')}`);
  }

  print('');
  print('4. String field names across the head corpora, with counts');

  const fieldCounts = new Map<string, number>();

  for (const [index, file] of files.entries()) {
    if (!file.includes('/evals/corpora/')) {
      continue;
    }

    for (const [field] of collectStrings(parseFile(file, texts[index] ?? ''), '')) {
      fieldCounts.set(field, (fieldCounts.get(field) ?? 0) + 1);
    }
  }

  const sorted = [...fieldCounts].toSorted((left, right) => right[1] - left[1]);

  print(`   ${sorted.map(([field, count]) => `${field}:${count}`).join(' ')}`);
}

function print(line: string): void {
  process.stdout.write(`${line}\n`);
}

async function readBaseFile(ref: string, path: string): Promise<string> {
  const child = Bun.spawn(['git', 'show', `${ref}:${path}`], { cwd: ROOT, stdout: 'pipe' });

  const text = await new Response(child.stdout).text();

  invariant((await child.exited) === 0, `git show ${ref}:${path} failed.`);

  return text;
}

function readHeadFile(path: string): Promise<string> {
  return readFile(join(ROOT, path), 'utf8');
}

function toCaseMessages(text: string): Map<string, string> {
  const raw: unknown = JSON.parse(text);
  const cases = isToolInput(raw) && Array.isArray(raw['cases']) ? raw['cases'] : [];

  return new Map(
    cases.flatMap((entry: unknown) =>
      isToolInput(entry) &&
      typeof entry['id'] === 'string' &&
      typeof entry['lastUserMessage'] === 'string'
        ? [[entry['id'], entry['lastUserMessage']] as const]
        : [],
    ),
  );
}

function toMessageBank(text: string): Map<string, string> {
  const raw: unknown = JSON.parse(text);
  const messages = isToolInput(raw) && isToolInput(raw['messages']) ? raw['messages'] : {};

  return new Map(
    Object.entries(messages).flatMap(([key, value]) =>
      typeof value === 'string' ? [[key, value] as const] : [],
    ),
  );
}

async function collectFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true, recursive: true });

  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name))
    .toSorted();
}

function parseFile(file: string, text: string): unknown {
  if (file.endsWith('.jsonl')) {
    return text
      .trimEnd()
      .split('\n')
      .map((line): unknown => JSON.parse(line));
  }

  return file.endsWith('.json') ? (JSON.parse(text) as unknown) : text;
}

// The second-judge message bank keys each message by its name, so a key
// under it is reported as the bank's own field.
function collectStrings(value: unknown, key: string): [string, string][] {
  if (typeof value === 'string') {
    return [[key === '' ? 'text' : key, value]];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item: unknown) => collectStrings(item, key));
  }

  if (isToolInput(value)) {
    const isBank = key === 'messages';

    return Object.entries(value).flatMap(([field, item]) => {
      const name = isBank ? key : field;

      return collectStrings(item, name);
    });
  }

  return [];
}

const LONGEST_RUN = 40;

function buildWindowSets(messages: readonly string[]): Set<string>[] {
  const sets = Array.from({ length: LONGEST_RUN + 1 }, () => new Set<string>());

  for (const message of messages) {
    const words = splitWords(message);

    for (let size = 1; size <= LONGEST_RUN; size += 1) {
      for (let start = 0; start + size <= words.length; start += 1) {
        sets[size]?.add(words.slice(start, start + size).join(' '));
      }
    }
  }

  return sets;
}

function countLongestRun(words: readonly string[], windows: readonly Set<string>[]): number {
  let longest = 0;

  for (let size = 1; size <= LONGEST_RUN; size += 1) {
    const set = windows[size] ?? new Set<string>();

    const starts = Array.from(
      { length: Math.max(0, words.length - size + 1) },
      (_v, index) => index,
    );

    const found = starts.some((start) => set.has(words.slice(start, start + size).join(' ')));

    if (!found) {
      return longest;
    }

    longest = size;
  }

  return longest;
}

const EDGE_PUNCTUATION = /^[^\p{L}\p{N}]*(?<core>.*?)[^\p{L}\p{N}]*$/su;

// A path or a repository name is an identifier the cases keep on purpose, so
// a word that holds a slash is left out of every run.
function splitWords(text: string): string[] {
  return [...text.matchAll(/\S+/gu)].flatMap((match) => {
    const core = EDGE_PUNCTUATION.exec(match[0])?.groups?.['core'] ?? '';

    return core === '' || core.includes('/') ? [] : [core.toLowerCase()];
  });
}

await main();
