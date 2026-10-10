// Fails on an import that crosses a forbidden module boundary. Each file under
// src/ and mods/ gets a zone; each import it makes is resolved, the target gets
// a zone too, and every rule that is on judges the edge.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { Visitor, parseSync } from 'oxc-parser';

export type RuleName =
  | 'zone-assignment'
  | 'unresolved'
  | 'src-mods-apart'
  | 'core-no-tooling'
  | 'network'
  | 'mod'
  | 'contract'
  | 'request'
  | 'support'
  | 'stages'
  | 'child-process';

export interface ImportFinding {
  readonly rule: RuleName;
  readonly file: string;
  readonly line: number;
  readonly message: string;
}

export interface CheckImportsOptions {
  // a rule that is off has findings today, so a test switches it on to exercise it
  readonly enable?: readonly RuleName[];
}

export interface CheckImportsResult {
  readonly findings: readonly ImportFinding[];
  readonly pending: readonly ImportFinding[];
}

export function checkImports(root: string, options: CheckImportsOptions = {}): CheckImportsResult {
  const enabled = collectEnabledRules(options);
  const findings: ImportFinding[] = [];
  const pending: ImportFinding[] = [];

  for (const file of collectCheckedFiles(root)) {
    for (const finding of checkFile(root, file).filter((entry) => shouldReport(file, entry))) {
      (enabled.has(finding.rule) ? findings : pending).push(finding);
    }
  }

  return { findings, pending };
}

interface Rule {
  readonly name: RuleName;
  readonly enabled: boolean;
  readonly ticket?: string;
}

const RULES: readonly Rule[] = [
  { name: 'zone-assignment', enabled: true },
  { name: 'unresolved', enabled: true },
  { name: 'src-mods-apart', enabled: true },
  { name: 'core-no-tooling', enabled: true },
  { name: 'network', enabled: true },
  { name: 'mod', enabled: true },
  { name: 'contract', enabled: false, ticket: 'GEO-220' },
  { name: 'request', enabled: false, ticket: 'GEO-220' },
  { name: 'support', enabled: false, ticket: 'GEO-221' },
  { name: 'stages', enabled: false, ticket: 'GEO-221' },
  { name: 'child-process', enabled: false, ticket: 'GEO-223' },
];

function collectEnabledRules(options: CheckImportsOptions): Set<RuleName> {
  return new Set([
    ...RULES.filter((rule) => rule.enabled).map((rule) => rule.name),
    ...(options.enable ?? []),
  ]);
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

function checkFile(root: string, file: string): ImportFinding[] {
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
    for (const planned of planImportFindings(root, file, fromZone, edge)) {
      findings.push(buildFinding(edge.offset, planned));
    }
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
}

const GLOBAL_OBJECTS = new Set(['globalThis', 'self', 'window']);

function collectFileFacts(file: string, source: string): FileFacts {
  const parsed = parseSync(file, source);
  const edges: ImportEdge[] = [];
  const fetchOffsets: number[] = [];

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
      if (node.source.type === 'Literal' && typeof node.source.value === 'string') {
        edges.push({ specifier: node.source.value, offset: node.start, typeOnly: false });
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
    },
  });

  visitor.visit(parsed.program);

  return { edges, fetchOffsets };
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
): PlannedFinding[] {
  if (!edge.specifier.startsWith('.')) {
    return planBuiltinFindings(file, edge);
  }

  const target = resolveImport(root, file, edge.specifier);

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

  if (fromZone === 'mod' && toZone !== 'mod' && toZone !== 'contract') {
    findings.push([
      isCore(target) ? 'src-mods-apart' : 'mod',
      `the mod imports outside itself: ${edge}`,
    ]);
  }

  if (isCore(file) && TOOLING_DIRS.some((dir) => target.startsWith(dir))) {
    findings.push(['core-no-tooling', `src/ imports eval, script or test code: ${edge}`]);
  }

  if ((typeOnly && isTypesFile(target)) || toZone === 'contract') {
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
  const result = checkImports(join(import.meta.dirname, '..'));

  for (const rule of RULES.filter((entry) => !entry.enabled)) {
    const count = result.pending.filter((finding) => finding.rule === rule.name).length;

    process.stdout.write(
      `check-imports: ${rule.name} is off until ${rule.ticket} (${count} edges)\n`,
    );
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
