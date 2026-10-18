import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import invariant from 'tiny-invariant';
import { INVENTED_CORPUS_MESSAGES } from './invented-corpus-messages.ts';

// The script holds no recorded text, because a public file must not carry
// it: a quoted run is found by the position of the words it copies.

const CORPORA = join(import.meta.dirname, '../evals/corpora');

interface OldMessage {
  readonly replacement: string;
  readonly text: string;
}

interface QuoteSite {
  readonly caseKey: string;
  readonly key: string;
}

async function main(): Promise<void> {
  const realTraffic = await loadCorpusFile('decision-rules/real-traffic.json');
  const questionSeverity = await loadCorpusFile('question-severity/cases.json');
  const defaultBranchWrite = await loadCorpusFile('default-branch-write/cases.json');
  const secondJudge = await loadCorpusFile('second-judge/cases.json');

  const oldMessages = new Map<string, OldMessage>([
    ...collectOldMessages('decision-rules', realTraffic, INVENTED_CORPUS_MESSAGES.realTraffic),
    ...collectOldMessages(
      'question-severity',
      questionSeverity,
      INVENTED_CORPUS_MESSAGES.questionSeverity,
    ),
    ...collectOldMessages(
      'default-branch-write',
      defaultBranchWrite,
      INVENTED_CORPUS_MESSAGES.defaultBranchWrite,
    ),
    ...collectSecondJudgeMessages(secondJudge),
  ]);

  const missing: QuoteSite[] = [];

  const samples = new Map<string, string>();

  for (const path of [
    'recorded/judge/geo-161-sonnet/samples.jsonl',
    'recorded/judge/geo-407-sonnet/samples.jsonl',
    'recorded/default-branch-write/geo-475-sonnet/samples.jsonl',
    'recorded/user-named-grant/geo-163-sonnet/samples.jsonl',
  ]) {
    const text = await readFile(join(CORPORA, path), 'utf8');

    const rows = text
      .trimEnd()
      .split('\n')
      .map((line) => {
        const row = JSON.parse(line) as Record<string, unknown>;
        const caseKey = String(row['caseKey']);
        const old = oldMessages.get(caseKey);

        if (old === undefined || typeof row['reason'] !== 'string') {
          return line;
        }

        const rewritten = buildUnquotedText(row['reason'], [old], (key) =>
          missing.push({ caseKey, key }),
        );

        return rewritten === row['reason'] ? line : JSON.stringify({ ...row, reason: rewritten });
      });

    samples.set(path, `${rows.join('\n')}\n`);
  }

  const pool = [...new Map([...oldMessages.values()].map((old) => [old.text, old])).values()];

  const answerGuidance = await loadCorpusFile('answer-guidance/cases.json');

  for (const [corpus, file] of [
    ['decision-rules', realTraffic],
    ['question-severity', questionSeverity],
    ['default-branch-write', defaultBranchWrite],
    ['second-judge', secondJudge],
    ['answer-guidance', answerGuidance],
  ] as const) {
    for (const entry of file.cases) {
      const caseKey = `${corpus}/${entry.id ?? entry.name}`;
      const own = oldMessages.get(caseKey);
      const candidates = own === undefined ? pool : [own, ...pool];

      entry.input = buildUnquotedInput(entry.input, null, (text) =>
        buildUnquotedText(text, candidates, (key) => missing.push({ caseKey, key })),
      );
    }
  }

  invariant(
    missing.length === 0,
    `Quoted runs with no replacement:\n${[...new Set(missing.map((site) => `${site.caseKey} ${site.key}`))].join('\n')}`,
  );

  for (const [path, text] of samples) {
    await writeFile(join(CORPORA, path), text);
  }

  updateCases(realTraffic, INVENTED_CORPUS_MESSAGES.realTraffic);
  updateCases(questionSeverity, INVENTED_CORPUS_MESSAGES.questionSeverity);
  updateCases(defaultBranchWrite, INVENTED_CORPUS_MESSAGES.defaultBranchWrite);
  updateSecondJudgeMessages(secondJudge);

  await writeCorpusFile('decision-rules/real-traffic.json', realTraffic);
  await writeCorpusFile('question-severity/cases.json', questionSeverity);
  await writeCorpusFile('default-branch-write/cases.json', defaultBranchWrite);
  await writeCorpusFile('second-judge/cases.json', secondJudge);
  await writeCorpusFile('answer-guidance/cases.json', answerGuidance);
}

interface CorpusFile {
  readonly cases: { id: string; name?: string; lastUserMessage?: string | null; input?: unknown }[];
  readonly messages?: Record<string, string>;
}

async function loadCorpusFile(path: string): Promise<CorpusFile> {
  const text = await readFile(join(CORPORA, path), 'utf8');

  return JSON.parse(text) as CorpusFile;
}

function collectOldMessages(
  corpus: string,
  file: CorpusFile,
  replacements: Readonly<Record<string, string>>,
): [string, OldMessage][] {
  const ids = new Set(file.cases.map((entry) => entry.id));

  const unknown = Object.keys(replacements).filter((id) => !ids.has(id));

  invariant(unknown.length === 0, `${corpus} has no cases ${unknown.join(', ')}.`);

  return file.cases.flatMap((entry) => {
    const replacement = replacements[entry.id];
    const text = entry.lastUserMessage;

    return replacement === undefined || typeof text !== 'string'
      ? []
      : [[`${corpus}/${entry.id}`, { replacement, text }]];
  });
}

function collectSecondJudgeMessages(file: CorpusFile): [string, OldMessage][] {
  const messages = file.messages ?? {};

  return file.cases.flatMap((entry) => {
    const key = (entry as { message?: string }).message;
    const text = key === undefined ? undefined : messages[key];
    const replacement = key === undefined ? undefined : INVENTED_CORPUS_MESSAGES.secondJudge[key];

    return text === undefined || replacement === undefined
      ? []
      : [[`second-judge/${entry.id}`, { replacement, text }]];
  });
}

function updateCases(file: CorpusFile, replacements: Readonly<Record<string, string>>): void {
  for (const entry of file.cases) {
    const replacement = replacements[entry.id];

    if (replacement !== undefined) {
      entry.lastUserMessage = replacement;
    }
  }
}

function updateSecondJudgeMessages(file: CorpusFile): void {
  const messages = file.messages;

  invariant(messages !== undefined, 'The second-judge corpus has no message bank.');

  for (const [key, replacement] of Object.entries(INVENTED_CORPUS_MESSAGES.secondJudge)) {
    invariant(key in messages, `The second-judge corpus has no message ${key}.`);

    messages[key] = replacement;
  }
}

async function writeCorpusFile(path: string, file: CorpusFile): Promise<void> {
  await writeFile(join(CORPORA, path), `${JSON.stringify(file, null, 2)}\n`);
}

const QUOTE_WORDS = 5;

interface Word {
  readonly key: string;
  readonly start: number;
  readonly end: number;
}

// A notification quotes the description the agent gave its background
// command, so a run that a description shares with one is the agent's words.
function buildUnquotedInput(
  value: unknown,
  key: string | null,
  toUnquoted: (text: string) => string,
): unknown {
  if (typeof value === 'string') {
    return key === 'description' ? value : toUnquoted(value);
  }

  if (Array.isArray(value)) {
    return value.map((item: unknown) => buildUnquotedInput(item, null, toUnquoted));
  }

  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([field, item]) => [
        field,
        buildUnquotedInput(item, field, toUnquoted),
      ]),
    );
  }

  return value;
}

// Each candidate is matched on its own, so a run never joins the words of two
// messages. A run the invented message keeps word for word, such as a command
// the case names, stays.
function buildUnquotedText(
  text: string,
  candidates: readonly OldMessage[],
  recordMissing: (key: string) => void,
): string {
  return candidates.reduce(
    (current, old) => buildTextWithoutRuns(current, old, recordMissing),
    text,
  );
}

function buildTextWithoutRuns(
  text: string,
  old: OldMessage,
  recordMissing: (key: string) => void,
): string {
  const oldWords = splitWords(old.text).map((word) => word.key);
  const keptWords = splitWords(old.replacement).map((word) => word.key);

  const windows = new Set(collectWindowKeys(oldWords));

  const words = splitWords(text);
  const runs: { first: number; last: number }[] = [];

  for (let index = 0; index + QUOTE_WORDS <= words.length; index += 1) {
    const key = toWindowKey(words.slice(index, index + QUOTE_WORDS).map((word) => word.key));

    if (!windows.has(key)) {
      continue;
    }

    const open = runs.at(-1);

    if (open !== undefined && index <= open.last) {
      open.last = index + QUOTE_WORDS - 1;
    } else {
      runs.push({ first: index, last: index + QUOTE_WORDS - 1 });
    }
  }

  return runs.reduceRight((current, run) => {
    const runKeys = words.slice(run.first, run.last + 1).map((word) => word.key);

    if (findRunStart(keptWords, runKeys) >= 0) {
      return current;
    }

    const key = `${findRunStart(oldWords, runKeys)}+${runKeys.length}`;
    const replacement = INVENTED_CORPUS_MESSAGES.quoteReplacements.get(old.replacement)?.[key];
    const first = words[run.first];
    const last = words[run.last];

    invariant(first !== undefined && last !== undefined, 'A run lies inside the text.');

    if (replacement === undefined) {
      recordMissing(key);

      return current;
    }

    return `${current.slice(0, first.start)}${replacement}${current.slice(last.end)}`;
  }, text);
}

function collectWindowKeys(keys: readonly string[]): string[] {
  return keys
    .slice(0, Math.max(0, keys.length - QUOTE_WORDS + 1))
    .map((_key, index) => toWindowKey(keys.slice(index, index + QUOTE_WORDS)));
}

function toWindowKey(keys: readonly string[]): string {
  return keys.join(' ');
}

function findRunStart(oldWords: readonly string[], runKeys: readonly string[]): number {
  return oldWords.findIndex((_key, index) =>
    runKeys.every((key, offset) => oldWords[index + offset] === key),
  );
}

const EDGE_PUNCTUATION = /^[^\p{L}\p{N}]*(?<core>.*?)[^\p{L}\p{N}]*$/su;

function splitWords(text: string): Word[] {
  return [...text.matchAll(/\S+/gu)].flatMap((match) => {
    const core = EDGE_PUNCTUATION.exec(match[0])?.groups?.['core'] ?? '';
    const start = match.index + match[0].indexOf(core);

    return core === '' ? [] : [{ key: core.toLowerCase(), start, end: start + core.length }];
  });
}

await main();
