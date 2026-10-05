import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import * as z from 'zod';
import type { ClaudeRules } from '../config/load-claude-rules.ts';
import type { RepositoryContext } from '../model/types.ts';

export interface EvaluationCase {
  readonly id: string;
  readonly source: 'real' | 'control' | 'frozen';
  readonly label: 'safe' | 'risk' | 'catastrophic';
  readonly name: string;
  readonly tool: string;
  readonly input: Readonly<Record<string, unknown>>;
  readonly lastUserMessage: string;
  readonly repositoryContext: RepositoryContext;
}

export interface SecondJudgeCorpus {
  readonly corpusHash: string;
  readonly configuredRules: ClaudeRules;
  readonly guidance: Readonly<Record<string, string>>;
  readonly cases: readonly EvaluationCase[];
}

export async function loadSecondJudgeCorpus(root: string): Promise<SecondJudgeCorpus> {
  const [corpusText, frozenText, guidanceText] = await Promise.all([
    readFile(join(root, 'fixtures/second-judge/cases.json'), 'utf8'),
    readFile(join(root, 'fixtures/answer-guidance/cases.json'), 'utf8'),
    readFile(join(root, 'fixtures/second-judge/guidance.json'), 'utf8'),
  ]);

  const labelSchema = z.enum(['safe', 'risk', 'catastrophic']);
  const strings = z.array(z.string());
  const input = z.record(z.string(), z.unknown());

  const contextSchema = z.object({
    cwd: z.string(),
    branch: z.string().nullable(),
    defaultBranch: z.string().nullable(),
  });

  const caseSchema = z.object({
    id: z.string(),
    label: labelSchema,
    category: z.enum(['loss', 'protected-write', 'outbound', 'credentials']).optional(),
    name: z.string(),
    message: z.string(),
    context: z.string(),
    tool: z.string(),
    input,
    note: z.string().optional(),
  });

  const rulesSchema = z.object({
    environment: strings,
    allow: strings,
    soft_deny: strings,
    hard_deny: strings,
  });

  const frozenLabels = z.object({
    context: z.string(),
    labels: z.record(z.string(), labelSchema),
  });

  const corpusSchema = z.object({
    contexts: z.record(z.string(), contextSchema),
    configuredRules: rulesSchema,
    messages: z.record(z.string(), z.string()),
    frozen: frozenLabels,
    cases: z.array(caseSchema),
  });

  const frozenCase = z.object({ name: z.string(), tool: z.string(), input });
  const frozenSchema = z.object({ lastUserMessage: z.string(), cases: z.array(frozenCase) });

  const guidedRules = [
    'Default Branch Write',
    'Data Exfiltration',
    'Outbound Communication',
    'Secret Persistence',
    'Security Control Removal',
  ];

  const guidanceEntries = guidedRules.map((name) => [name, z.string().min(1)] as const);
  const guidanceSchema = z.strictObject(Object.fromEntries(guidanceEntries));
  const raw = [corpusText, frozenText, guidanceText].map((text): unknown => JSON.parse(text));
  const corpus = corpusSchema.parse(raw[0]);
  const frozen = frozenSchema.parse(raw[1]);
  const guidance = guidanceSchema.parse(raw[2]);

  const cases: EvaluationCase[] = corpus.cases.map((entry) => ({
    id: entry.id,
    source: entry.id.startsWith('control-') ? 'control' : 'real',
    label: entry.label,
    name: entry.name,
    tool: entry.tool,
    input: entry.input,
    lastUserMessage: getEntry(corpus.messages, entry.message, 'message'),
    repositoryContext: getEntry(corpus.contexts, entry.context, 'context'),
  }));

  const frozenContext = getEntry(corpus.contexts, corpus.frozen.context, 'context');

  for (const [index, entry] of frozen.cases.entries()) {
    const frozenInput = { ...entry.input };
    const file = frozenInput['file_path'];

    if (typeof file === 'string' && !isAbsolute(file)) {
      frozenInput['file_path'] = join(frozenContext.cwd, file);
    }

    cases.push({
      id: `frozen-${String(index + 1).padStart(2, '0')}`,
      source: 'frozen',
      label: getEntry(corpus.frozen.labels, entry.name, 'frozen label'),
      name: entry.name,
      tool: entry.tool,
      input: frozenInput,
      lastUserMessage: frozen.lastUserMessage,
      repositoryContext: frozenContext,
    });
  }

  if (new Set(cases.map((entry) => entry.id)).size !== cases.length) {
    throw new Error('The second-judge corpus repeats a case id');
  }

  // Hashing the parsed values keeps a formatter pass from orphaning the reports.
  const corpusHash = createHash('sha256').update(JSON.stringify(raw)).digest('hex');

  return { corpusHash, configuredRules: corpus.configuredRules, guidance, cases };
}

function getEntry<T>(entries: Readonly<Record<string, T>>, key: string, kind: string): T {
  const value = entries[key];

  if (value === undefined) {
    throw new Error(`The second-judge corpus names an unknown ${kind}: ${key}`);
  }

  return value;
}
