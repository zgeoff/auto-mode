// Fails on an import that crosses a forbidden module boundary. Each file under
// src/ and mods/ gets a zone; each import it makes is resolved, the target gets
// a zone too, and every rule judges the edge.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { Visitor, parseSync } from 'oxc-parser';
import { z } from 'zod';

const RULE_NAMES = [
  'zone-assignment',
  'unresolved',
  'src-mods-apart',
  'core-no-tooling',
  'network',
  'mod',
  'contract',
  'request',
  'support',
  'stages',
  'child-process',
  'stale-known-edge',
] as const;

export type RuleName = (typeof RULE_NAMES)[number];

export interface ImportFinding {
  readonly rule: RuleName;
  readonly file: string;
  readonly line: number;
  readonly message: string;
}

export interface CheckImportsResult {
  readonly findings: readonly ImportFinding[];
  readonly known: readonly ImportFinding[];
}

export function checkImports(root: string): CheckImportsResult {
  const knownEdges = Object.fromEntries(
    Object.values(loadKnownEdges(root))
      .flat()
      .map((edge) => [toKnownKey(edge), edge]),
  );

  const selfReferences = loadSelfReferences(root);
  const findings: ImportFinding[] = [];
  const known: ImportFinding[] = [];

  for (const file of collectCheckedFiles(root)) {
    const fileFindings = checkFile(root, file, selfReferences);

    for (const finding of fileFindings.filter((entry) => shouldReport(file, entry))) {
      (Object.hasOwn(knownEdges, toKnownKey(finding)) ? known : findings).push(finding);
    }
  }

  return { findings: [...findings, ...planStaleFindings(knownEdges, known)], known };
}

const knownEdgeSchema = z.object({
  rule: z.enum(RULE_NAMES),
  file: z.string(),
  message: z.string(),
});

type KnownEdge = z.infer<typeof knownEdgeSchema>;

const knownEdgesSchema = z.record(z.string(), z.array(knownEdgeSchema));

// each import that breaks a zone today, grouped by the ticket that removes it
const KNOWN_EDGES_PATH = 'scripts/check-imports-known.json';

function loadKnownEdges(root: string): Record<string, KnownEdge[]> {
  const path = join(root, KNOWN_EDGES_PATH);

  if (!existsSync(path)) {
    return {};
  }

  return knownEdgesSchema.parse(JSON.parse(readFileSync(path, 'utf8')));
}

function toKnownKey(edge: Readonly<KnownEdge>): string {
  return JSON.stringify([edge.rule, edge.file, edge.message]);
}

function planStaleFindings(
  knownEdges: Readonly<Record<string, Readonly<KnownEdge>>>,
  known: readonly ImportFinding[],
): ImportFinding[] {
  const seen = new Set(known.map((finding) => toKnownKey(finding)));

  return Object.entries(knownEdges)
    .filter(([key]) => !seen.has(key))
    .map(([, edge]) => ({
      rule: 'stale-known-edge',
      file: edge.file,
      line: 1,
      message: `known edge no longer exists; remove it from ${KNOWN_EDGES_PATH}: ${edge.rule} ${edge.message}`,
    }));
}

interface SelfReferences {
  readonly name: string | undefined;
  readonly targets: Readonly<Record<string, string>>;
}

const exportTargetSchema = z.union([z.string(), z.record(z.string(), z.string())]);

const manifestSchema = z.object({
  name: z.string().optional(),
  exports: z.record(z.string(), exportTargetSchema).optional(),
});

// the eval condition maps each export to source, which is what the zones judge
const SOURCE_CONDITION = 'auto-mode-eval';

function loadSelfReferences(root: string): SelfReferences {
  const path = join(root, 'package.json');

  if (!existsSync(path)) {
    return { name: undefined, targets: {} };
  }

  const manifest = manifestSchema.parse(JSON.parse(readFileSync(path, 'utf8')));
  const targets: Record<string, string> = {};

  for (const [subpath, value] of Object.entries(manifest.exports ?? {})) {
    const target =
      typeof value === 'string' ? value : (value[SOURCE_CONDITION] ?? value['default']);

    if (target !== undefined) {
      targets[`${manifest.name}${subpath.slice(1)}`] = normalizePath(target);
    }
  }

  return { name: manifest.name, targets };
}

function normalizePath(path: string): string {
  return path.replace(/^\.\//u, '');
}

const CHECKED_FILES = new Bun.Glob('{src,mods}/**/*.ts');

function collectCheckedFiles(root: string): string[] {
  return [...CHECKED_FILES.scanSync({ cwd: root })].map((file) => toPosixPath(file)).toSorted();
}

function toPosixPath(path: string): string {
  return path.replaceAll('\\', '/');
}

type Zone =
  | 'orchestrator'
  | 'request'
  | 'support'
  | 'stage'
  | 'contract'
  | 'mod'
  | 'tooling'
  | 'unassigned';

type PlannedFinding = readonly [RuleName, string];

function checkFile(root: string, file: string, selfReferences: SelfReferences): ImportFinding[] {
  const source = readFileSync(join(root, file), 'utf8');
  const facts = collectFileFacts(file, source);
  const fromZone = getZone(file);
  const findings: ImportFinding[] = [];

  const buildFinding = (offset: number, [rule, message]: PlannedFinding): ImportFinding => ({
    rule,
    file,
    line: countLine(source, offset),
    message,
  });

  if (fromZone === 'unassigned') {
    findings.push(
      buildFinding(0, ['zone-assignment', 'file belongs to no zone; add its folder to a zone']),
    );
  }

  for (const edge of facts.edges) {
    for (const planned of planImportFindings(root, file, fromZone, edge, selfReferences)) {
      findings.push(buildFinding(edge.offset, planned));
    }
  }

  for (const offset of facts.computedOffsets) {
    findings.push(buildFinding(offset, ['unresolved', 'cannot check a computed import specifier']));
  }

  if (isCore(file) && !isNetworkModule(file)) {
    for (const offset of facts.fetchOffsets) {
      findings.push(buildFinding(offset, ['network', 'fetch( outside src/model/']));
    }
  }

  return findings;
}

interface ImportEdge {
  readonly specifier: string;
  readonly offset: number;
  readonly typeOnly: boolean;
}

interface FileFacts {
  readonly edges: readonly ImportEdge[];
  readonly fetchOffsets: readonly number[];
  readonly computedOffsets: readonly number[];
}

const GLOBAL_OBJECTS = new Set(['globalThis', 'self', 'window']);

function collectFileFacts(file: string, source: string): FileFacts {
  const parsed = parseSync(file, source);
  const edges: ImportEdge[] = [];
  const fetchOffsets: number[] = [];
  const computedOffsets: number[] = [];

  for (const statement of parsed.module.staticImports) {
    edges.push({
      specifier: statement.moduleRequest.value,
      offset: statement.start,
      typeOnly: statement.entries.length > 0 && statement.entries.every((entry) => entry.isType),
    });
  }

  for (const statement of parsed.module.staticExports) {
    const request = statement.entries.find((entry) => entry.moduleRequest !== null)?.moduleRequest;

    if (request !== undefined && request !== null) {
      edges.push({
        specifier: request.value,
        offset: statement.start,
        typeOnly: statement.entries.every((entry) => entry.isType),
      });
    }
  }

  const visitor = new Visitor({
    ImportExpression(node) {
      const request = node.source;

      if (request.type === 'Literal' && typeof request.value === 'string') {
        edges.push({ specifier: request.value, offset: node.start, typeOnly: false });
      } else if (request.type === 'TemplateLiteral' && request.expressions.length === 0) {
        edges.push({
          specifier: request.quasis.map((quasi) => quasi.value.cooked ?? '').join(''),
          offset: node.start,
          typeOnly: false,
        });
      } else {
        computedOffsets.push(node.start);
      }
    },
    TSImportType(node) {
      edges.push({ specifier: node.source.value, offset: node.start, typeOnly: true });
    },
    CallExpression(node) {
      const callee = node.callee;

      const isGlobalFetch =
        callee.type === 'MemberExpression' &&
        !callee.computed &&
        callee.property.type === 'Identifier' &&
        callee.property.name === 'fetch' &&
        callee.object.type === 'Identifier' &&
        GLOBAL_OBJECTS.has(callee.object.name);

      if ((callee.type === 'Identifier' && callee.name === 'fetch') || isGlobalFetch) {
        fetchOffsets.push(node.start);
      }

      if (callee.type !== 'Identifier' || callee.name !== 'require') {
        return;
      }

      const [argument] = node.arguments;

      if (argument?.type === 'Literal' && typeof argument.value === 'string') {
        edges.push({ specifier: argument.value, offset: node.start, typeOnly: false });
      } else if (argument?.type === 'TemplateLiteral' && argument.expressions.length === 0) {
        edges.push({
          specifier: argument.quasis.map((quasi) => quasi.value.cooked ?? '').join(''),
          offset: node.start,
          typeOnly: false,
        });
      } else {
        computedOffsets.push(node.start);
      }
    },
  });

  visitor.visit(parsed.program);

  return { edges, fetchOffsets, computedOffsets };
}

const SUPPORT_MODULES = new Set([
  'budget',
  'capture',
  'config',
  'diagnostics',
  'git',
  'policy',
  'process',
  'scope',
  'secrets',
  'shell',
  'state',
]);

const STAGE_MODULES = new Set(['bypass', 'containment', 'judge', 'model', 'rules']);

const ORCHESTRATOR_FILES = new Set([
  'src/classify-action.ts',
  'src/cli.ts',
  'src/eval/index.ts',
  'src/index.ts',
  'src/run-cli.ts',
]);

// the contract ticket settles this folder; the audit names it as an example
const CONTRACT_DIR = 'mods/auto-mode/contract/';

function getZone(path: string): Zone {
  if (ORCHESTRATOR_FILES.has(path)) {
    return 'orchestrator';
  }

  if (path.startsWith(CONTRACT_DIR)) {
    return 'contract';
  }

  if (path.startsWith('mods/auto-mode/')) {
    return 'mod';
  }

  if (!isCore(path)) {
    return path.startsWith('mods/') ? 'unassigned' : 'tooling';
  }

  const module = getSourceModule(path);

  if (module === 'request') {
    return 'request';
  }

  if (module !== undefined && SUPPORT_MODULES.has(module)) {
    return 'support';
  }

  if (module !== undefined && STAGE_MODULES.has(module)) {
    return 'stage';
  }

  return 'unassigned';
}

function isCore(path: string): boolean {
  return path.startsWith('src/');
}

function getSourceModule(path: string): string | undefined {
  const parts = path.split('/');

  return parts.length > 2 ? parts[1] : undefined;
}

function countLine(source: string, offset: number): number {
  let line = 1;

  for (let index = 0; index < offset; index += 1) {
    if (source[index] === '\n') {
      line += 1;
    }
  }

  return line;
}

function planImportFindings(
  root: string,
  file: string,
  fromZone: Zone,
  edge: ImportEdge,
  selfReferences: SelfReferences,
): PlannedFinding[] {
  const isSelfReference =
    selfReferences.name !== undefined &&
    (edge.specifier === selfReferences.name ||
      edge.specifier.startsWith(`${selfReferences.name}/`));

  if (!isSelfReference && !edge.specifier.startsWith('.')) {
    return planBuiltinFindings(file, edge);
  }

  const target = isSelfReference
    ? selfReferences.targets[edge.specifier]
    : resolveImport(root, file, edge.specifier);

  if (target === undefined) {
    return [['unresolved', `cannot resolve ${edge.specifier}`]];
  }

  return planEdgeFindings(file, fromZone, target, edge.typeOnly);
}

const PROCESS_DIRS = ['src/process/'];

function planBuiltinFindings(file: string, edge: ImportEdge): PlannedFinding[] {
  const name = edge.specifier.replace(/^node:/u, '');
  const findings: PlannedFinding[] = [];

  if (edge.typeOnly) {
    return findings;
  }

  if (/^(?:https?|http2)(?:\/|$)/u.test(name) && !isNetworkModule(file)) {
    findings.push(['network', `${edge.specifier} outside src/model/`]);
  }

  if (name === 'child_process' && !PROCESS_DIRS.some((dir) => file.startsWith(dir))) {
    findings.push(['child-process', `${edge.specifier} outside src/process/`]);
  }

  return findings;
}

function isNetworkModule(path: string): boolean {
  return path.startsWith('src/model/');
}

const RESOLVE_SUFFIXES = ['', '.ts', '/index.ts'];

function resolveImport(root: string, file: string, specifier: string): string | undefined {
  const base = resolve(root, dirname(file), specifier);

  for (const suffix of RESOLVE_SUFFIXES) {
    const candidate = `${base}${suffix}`;

    if (existsSync(candidate) && statSync(candidate).isFile()) {
      return toPosixPath(relative(root, candidate));
    }
  }

  return undefined;
}

const TOOLING_DIRS = ['evals/', 'scripts/', 'test-utils/', 'mocks/', 'fixtures/'];

function planEdgeFindings(
  file: string,
  fromZone: Zone,
  target: string,
  typeOnly: boolean,
): PlannedFinding[] {
  const toZone = getZone(target);
  const findings: PlannedFinding[] = [];
  const edge = `${file} → ${target}`;

  if (isCore(file) && target.startsWith('mods/') && toZone !== 'contract') {
    findings.push(['src-mods-apart', `src/ imports the mod: ${edge}`]);
  }

  if (
    (fromZone === 'mod' || fromZone === 'contract') &&
    toZone !== 'mod' &&
    toZone !== 'contract'
  ) {
    findings.push([
      isCore(target) ? 'src-mods-apart' : 'mod',
      `the mod imports outside itself: ${edge}`,
    ]);
  }

  if (isCore(file) && TOOLING_DIRS.some((dir) => target.startsWith(dir))) {
    findings.push(['core-no-tooling', `src/ imports eval, script or test code: ${edge}`]);
  }

  if (findings.length > 0 || (typeOnly && isTypesFile(target)) || toZone === 'contract') {
    return findings;
  }

  const zoneRule = pickZoneRule(file, fromZone, target, toZone);

  if (zoneRule !== undefined) {
    findings.push([zoneRule, `${fromZone} imports ${toZone}: ${edge}`]);
  }

  return findings;
}

function isTypesFile(path: string): boolean {
  return path === 'types.ts' || path.endsWith('/types.ts');
}

function pickZoneRule(
  file: string,
  fromZone: Zone,
  target: string,
  toZone: Zone,
): RuleName | undefined {
  if (fromZone === 'contract') {
    return 'contract';
  }

  if (fromZone === 'request' && toZone !== 'request') {
    return 'request';
  }

  if (fromZone === 'support' && toZone !== 'support') {
    return 'support';
  }

  if (
    fromZone === 'stage' &&
    toZone !== 'support' &&
    getSourceModule(file) !== getSourceModule(target)
  ) {
    return 'stages';
  }

  return undefined;
}

const TEST_FILE = /\.(?:test|bench|claude-check)\.ts$/u;

function shouldReport(file: string, finding: ImportFinding): boolean {
  return !TEST_FILE.test(file) || finding.rule === 'src-mods-apart';
}

function main(): void {
  const root = join(import.meta.dirname, '..');
  const result = checkImports(root);

  for (const [ticket, edges] of Object.entries(loadKnownEdges(root))) {
    process.stdout.write(`check-imports: ${edges.length} known edges wait for ${ticket}\n`);
  }

  for (const finding of result.findings) {
    process.stderr.write(`${finding.file}:${finding.line}  ${finding.rule}  ${finding.message}\n`);
  }

  if (result.findings.length > 0) {
    process.stderr.write(`check-imports: ${result.findings.length} forbidden imports\n`);

    process.exitCode = 1;

    return;
  }

  process.stdout.write('check-imports: no forbidden imports\n');
}

if (import.meta.main) {
  main();
}
