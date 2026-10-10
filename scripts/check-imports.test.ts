import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkImports } from './check-imports.ts';

async function setupTest() {
  const dir = await mkdtemp(join(tmpdir(), 'auto-mode-check-imports-'));

  onTestFinished(() => rm(dir, { recursive: true, force: true }));

  return { dir };
}

test('it finds no forbidden import in the repository', () => {
  expect(checkImports(join(import.meta.dirname, '..')).findings).toStrictEqual([]);
});

test('it reports a core file that imports test code', async () => {
  const ctx = await setupTest();

  await Bun.write(join(ctx.dir, 'test-utils/wait-for.ts'), 'export const waitFor = 1;\n');

  await Bun.write(
    join(ctx.dir, 'src/rules/classify-locally.ts'),
    "import { waitFor } from '../../test-utils/wait-for.ts';\n\nexport const value = waitFor;\n",
  );

  expect(checkImports(ctx.dir).findings).toStrictEqual([
    {
      rule: 'core-no-tooling',
      file: 'src/rules/classify-locally.ts',
      line: 1,
      message:
        'src/ imports eval, script or test code: src/rules/classify-locally.ts → test-utils/wait-for.ts',
    },
  ]);
});

test('it passes a core file that imports a support module', async () => {
  const ctx = await setupTest();

  await Bun.write(join(ctx.dir, 'src/config/config.ts'), 'export const config = 1;\n');

  await Bun.write(
    join(ctx.dir, 'src/rules/classify-locally.ts'),
    "import { config } from '../config/config.ts';\n\nexport const value = config;\n",
  );

  expect(checkImports(ctx.dir)).toStrictEqual({ findings: [], known: [] });
});

test('it reports a mod file that imports the core', async () => {
  const ctx = await setupTest();

  await Bun.write(join(ctx.dir, 'src/request/render-verdict.ts'), 'export const render = 1;\n');

  await Bun.write(
    join(ctx.dir, 'mods/auto-mode/hooks/register.ts'),
    "import { render } from '../../../src/request/render-verdict.ts';\n\nexport const value = render;\n",
  );

  expect(checkImports(ctx.dir).findings).toStrictEqual([
    {
      rule: 'src-mods-apart',
      file: 'mods/auto-mode/hooks/register.ts',
      line: 1,
      message:
        'the mod imports outside itself: mods/auto-mode/hooks/register.ts → src/request/render-verdict.ts',
    },
  ]);
});

test('it reports a core test file that imports the mod', async () => {
  const ctx = await setupTest();

  await Bun.write(join(ctx.dir, 'mods/auto-mode/hooks/types.ts'), 'export const mod = 1;\n');

  await Bun.write(
    join(ctx.dir, 'src/run-cli.test.ts'),
    "import { mod } from '../mods/auto-mode/hooks/types.ts';\n\nexport const value = mod;\n",
  );

  expect(checkImports(ctx.dir).findings).toStrictEqual([
    {
      rule: 'src-mods-apart',
      file: 'src/run-cli.test.ts',
      line: 1,
      message: 'src/ imports the mod: src/run-cli.test.ts → mods/auto-mode/hooks/types.ts',
    },
  ]);
});

test('it passes a core test file that imports test code', async () => {
  const ctx = await setupTest();

  await Bun.write(join(ctx.dir, 'test-utils/wait-for.ts'), 'export const waitFor = 1;\n');

  await Bun.write(
    join(ctx.dir, 'src/run-cli.test.ts'),
    "import { waitFor } from '../test-utils/wait-for.ts';\n\nexport const value = waitFor;\n",
  );

  expect(checkImports(ctx.dir)).toStrictEqual({ findings: [], known: [] });
});

test.each([
  ['a re-export of every name', "export * from '../../test-utils/wait-for.ts';\n"],
  ['a dynamic import', "export const value = await import('../../test-utils/wait-for.ts');\n"],
  [
    'a dynamic import of a template literal',
    'export const value = await import(`../../test-utils/wait-for.ts`);\n',
  ],
  ['a require call', "export const value = require('../../test-utils/wait-for.ts');\n"],
  [
    'a type-position import',
    "export type Value = typeof import('../../test-utils/wait-for.ts');\n",
  ],
])('it reports test code that a core file reaches through %s', async (_form, source) => {
  const ctx = await setupTest();

  await Bun.write(join(ctx.dir, 'test-utils/wait-for.ts'), 'export const waitFor = 1;\n');
  await Bun.write(join(ctx.dir, 'src/rules/classify-locally.ts'), source);

  expect(checkImports(ctx.dir).findings).toStrictEqual([
    {
      rule: 'core-no-tooling',
      file: 'src/rules/classify-locally.ts',
      line: 1,
      message:
        'src/ imports eval, script or test code: src/rules/classify-locally.ts → test-utils/wait-for.ts',
    },
  ]);
});

test('it reports a dynamic import whose specifier it cannot read', async () => {
  const ctx = await setupTest();

  await Bun.write(
    join(ctx.dir, 'src/rules/classify-locally.ts'),
    "const name = '../wait-for.ts';\n\nexport const value = await import(name);\n",
  );

  expect(checkImports(ctx.dir).findings).toStrictEqual([
    {
      rule: 'unresolved',
      file: 'src/rules/classify-locally.ts',
      line: 3,
      message: 'cannot check a computed import specifier',
    },
  ]);
});

test('it reports a mod file that imports test code', async () => {
  const ctx = await setupTest();

  await Bun.write(join(ctx.dir, 'test-utils/wait-for.ts'), 'export const waitFor = 1;\n');

  await Bun.write(
    join(ctx.dir, 'mods/auto-mode/hooks/register.ts'),
    "import { waitFor } from '../../../test-utils/wait-for.ts';\n\nexport const value = waitFor;\n",
  );

  expect(checkImports(ctx.dir).findings).toStrictEqual([
    {
      rule: 'mod',
      file: 'mods/auto-mode/hooks/register.ts',
      line: 1,
      message:
        'the mod imports outside itself: mods/auto-mode/hooks/register.ts → test-utils/wait-for.ts',
    },
  ]);
});

test('it reports a mod file that imports the core by package name', async () => {
  const ctx = await setupTest();

  await Bun.write(
    join(ctx.dir, 'package.json'),
    JSON.stringify({
      name: 'auto-mode',
      exports: { '.': { 'auto-mode-eval': './src/index.ts', default: './dist/index.js' } },
    }),
  );

  await Bun.write(join(ctx.dir, 'src/index.ts'), 'export const index = 1;\n');

  await Bun.write(
    join(ctx.dir, 'mods/auto-mode/hooks/register.ts'),
    "import { index } from 'auto-mode';\n\nexport const value = index;\n",
  );

  expect(checkImports(ctx.dir).findings).toStrictEqual([
    {
      rule: 'src-mods-apart',
      file: 'mods/auto-mode/hooks/register.ts',
      line: 1,
      message: 'the mod imports outside itself: mods/auto-mode/hooks/register.ts → src/index.ts',
    },
  ]);
});

test('it reports a package subpath that the exports map lacks', async () => {
  const ctx = await setupTest();

  await Bun.write(
    join(ctx.dir, 'package.json'),
    JSON.stringify({ name: 'auto-mode', exports: { '.': './src/index.ts' } }),
  );

  await Bun.write(join(ctx.dir, 'src/index.ts'), 'export const index = 1;\n');

  await Bun.write(
    join(ctx.dir, 'src/rules/classify-locally.ts'),
    "import { index } from 'auto-mode/internal';\n\nexport const value = index;\n",
  );

  expect(checkImports(ctx.dir).findings).toStrictEqual([
    {
      rule: 'unresolved',
      file: 'src/rules/classify-locally.ts',
      line: 1,
      message: 'cannot resolve auto-mode/internal',
    },
  ]);
});

test('it reports a contract file that imports the core', async () => {
  const ctx = await setupTest();

  await Bun.write(join(ctx.dir, 'src/model/types.ts'), 'export type Verdict = string;\n');

  await Bun.write(
    join(ctx.dir, 'mods/auto-mode/contract/verdict.ts'),
    "import type { Verdict } from '../../../src/model/types.ts';\n\nexport const value: Verdict = 'allow';\n",
  );

  expect(checkImports(ctx.dir).findings).toStrictEqual([
    {
      rule: 'src-mods-apart',
      file: 'mods/auto-mode/contract/verdict.ts',
      line: 1,
      message:
        'the mod imports outside itself: mods/auto-mode/contract/verdict.ts → src/model/types.ts',
    },
  ]);
});

test('it reports a bare fetch call outside the model module', async () => {
  const ctx = await setupTest();

  await Bun.write(
    join(ctx.dir, 'src/scope/read-pull-request.ts'),
    "export const value = await fetch('https://example.com');\n",
  );

  expect(checkImports(ctx.dir).findings).toStrictEqual([
    {
      rule: 'network',
      file: 'src/scope/read-pull-request.ts',
      line: 1,
      message: 'fetch( outside src/model/',
    },
  ]);
});

test('it reports an http module import outside the model module', async () => {
  const ctx = await setupTest();

  await Bun.write(
    join(ctx.dir, 'src/scope/read-pull-request.ts'),
    "import { request } from 'node:https';\n\nexport const value = request;\n",
  );

  expect(checkImports(ctx.dir).findings).toStrictEqual([
    {
      rule: 'network',
      file: 'src/scope/read-pull-request.ts',
      line: 1,
      message: 'node:https outside src/model/',
    },
  ]);
});

test('it reports a globalThis fetch call outside the model module', async () => {
  const ctx = await setupTest();

  await Bun.write(
    join(ctx.dir, 'src/scope/read-pull-request.ts'),
    "export const value = await globalThis.fetch('https://example.com');\n",
  );

  expect(checkImports(ctx.dir).findings).toStrictEqual([
    {
      rule: 'network',
      file: 'src/scope/read-pull-request.ts',
      line: 1,
      message: 'fetch( outside src/model/',
    },
  ]);
});

test('it passes a fetch call inside the model module', async () => {
  const ctx = await setupTest();

  await Bun.write(
    join(ctx.dir, 'src/model/anthropic-client.ts'),
    "export const value = await fetch('https://example.com');\n",
  );

  expect(checkImports(ctx.dir)).toStrictEqual({ findings: [], known: [] });
});

test('it reports a core file outside every zone', async () => {
  const ctx = await setupTest();

  await Bun.write(join(ctx.dir, 'src/widgets/build-widget.ts'), 'export const widget = 1;\n');

  expect(checkImports(ctx.dir).findings).toStrictEqual([
    {
      rule: 'zone-assignment',
      file: 'src/widgets/build-widget.ts',
      line: 1,
      message: 'file belongs to no zone; add its folder to a zone',
    },
  ]);
});

test('it reports an import that resolves to no file', async () => {
  const ctx = await setupTest();

  await Bun.write(
    join(ctx.dir, 'src/rules/classify-locally.ts'),
    "export { missing } from './missing.ts';\n",
  );

  expect(checkImports(ctx.dir).findings).toStrictEqual([
    {
      rule: 'unresolved',
      file: 'src/rules/classify-locally.ts',
      line: 1,
      message: 'cannot resolve ./missing.ts',
    },
  ]);
});

test('it holds a listed stage-to-stage import apart from the findings', async () => {
  const ctx = await setupTest();

  await Bun.write(
    join(ctx.dir, 'scripts/check-imports-known.json'),
    JSON.stringify({
      'GEO-221': [
        {
          rule: 'stages',
          file: 'src/containment/check-containment.ts',
          message:
            'stage imports stage: src/containment/check-containment.ts → src/rules/split-shell-command.ts',
        },
      ],
    }),
  );

  await Bun.write(join(ctx.dir, 'src/rules/split-shell-command.ts'), 'export const split = 1;\n');

  await Bun.write(
    join(ctx.dir, 'src/containment/check-containment.ts'),
    "import { split } from '../rules/split-shell-command.ts';\n\nexport const value = split;\n",
  );

  expect(checkImports(ctx.dir)).toStrictEqual({
    findings: [],
    known: [
      {
        rule: 'stages',
        file: 'src/containment/check-containment.ts',
        line: 1,
        message:
          'stage imports stage: src/containment/check-containment.ts → src/rules/split-shell-command.ts',
      },
    ],
  });
});

test('it reports a known edge that the code no longer has', async () => {
  const ctx = await setupTest();

  await Bun.write(
    join(ctx.dir, 'scripts/check-imports-known.json'),
    JSON.stringify({
      'GEO-221': [
        {
          rule: 'stages',
          file: 'src/containment/check-containment.ts',
          message:
            'stage imports stage: src/containment/check-containment.ts → src/rules/split-shell-command.ts',
        },
      ],
    }),
  );

  await Bun.write(
    join(ctx.dir, 'src/containment/check-containment.ts'),
    'export const value = 1;\n',
  );

  expect(checkImports(ctx.dir).findings).toStrictEqual([
    {
      rule: 'stale-known-edge',
      file: 'src/containment/check-containment.ts',
      line: 1,
      message:
        'known edge no longer exists; remove it from scripts/check-imports-known.json: stages stage imports stage: src/containment/check-containment.ts → src/rules/split-shell-command.ts',
    },
  ]);
});

test('it reports a stage-to-stage import that the known list lacks', async () => {
  const ctx = await setupTest();

  await Bun.write(join(ctx.dir, 'src/rules/split-shell-command.ts'), 'export const split = 1;\n');

  await Bun.write(
    join(ctx.dir, 'src/containment/check-containment.ts'),
    "import { split } from '../rules/split-shell-command.ts';\n\nexport const value = split;\n",
  );

  expect(checkImports(ctx.dir).findings).toStrictEqual([
    {
      rule: 'stages',
      file: 'src/containment/check-containment.ts',
      line: 1,
      message:
        'stage imports stage: src/containment/check-containment.ts → src/rules/split-shell-command.ts',
    },
  ]);
});

test('it reports a support module that imports a stage', async () => {
  const ctx = await setupTest();

  await Bun.write(join(ctx.dir, 'src/model/load-mcp-servers.ts'), 'export const servers = 1;\n');

  await Bun.write(
    join(ctx.dir, 'src/scope/load-task-scope.ts'),
    "import { servers } from '../model/load-mcp-servers.ts';\n\nexport const value = servers;\n",
  );

  expect(checkImports(ctx.dir).findings).toStrictEqual([
    {
      rule: 'support',
      file: 'src/scope/load-task-scope.ts',
      line: 1,
      message:
        'support imports stage: src/scope/load-task-scope.ts → src/model/load-mcp-servers.ts',
    },
  ]);
});

test('it reports a request file that imports a support module', async () => {
  const ctx = await setupTest();

  await Bun.write(join(ctx.dir, 'src/scope/update-session-scope.ts'), 'export const update = 1;\n');

  await Bun.write(
    join(ctx.dir, 'src/request/parse-scope-record-request.ts'),
    "import { update } from '../scope/update-session-scope.ts';\n\nexport const value = update;\n",
  );

  expect(checkImports(ctx.dir).findings).toStrictEqual([
    {
      rule: 'request',
      file: 'src/request/parse-scope-record-request.ts',
      line: 1,
      message:
        'request imports support: src/request/parse-scope-record-request.ts → src/scope/update-session-scope.ts',
    },
  ]);
});

test('it reports a contract file that imports a mod file', async () => {
  const ctx = await setupTest();

  await Bun.write(join(ctx.dir, 'mods/auto-mode/hooks/types.ts'), 'export const mod = 1;\n');

  await Bun.write(
    join(ctx.dir, 'mods/auto-mode/contract/verdict.ts'),
    "import { mod } from '../hooks/types.ts';\n\nexport const value = mod;\n",
  );

  expect(checkImports(ctx.dir).findings).toStrictEqual([
    {
      rule: 'contract',
      file: 'mods/auto-mode/contract/verdict.ts',
      line: 1,
      message:
        'contract imports mod: mods/auto-mode/contract/verdict.ts → mods/auto-mode/hooks/types.ts',
    },
  ]);
});

test('it passes a type-only import of a types file across stages', async () => {
  const ctx = await setupTest();

  await Bun.write(join(ctx.dir, 'src/model/types.ts'), 'export type Verdict = string;\n');

  await Bun.write(
    join(ctx.dir, 'src/containment/check-containment.ts'),
    "import type { Verdict } from '../model/types.ts';\n\nexport const value: Verdict = 'allow';\n",
  );

  expect(checkImports(ctx.dir)).toStrictEqual({
    findings: [],
    known: [],
  });
});

test('it reports a value import of a types file across stages', async () => {
  const ctx = await setupTest();

  await Bun.write(join(ctx.dir, 'src/model/types.ts'), 'export const verdicts = [];\n');

  await Bun.write(
    join(ctx.dir, 'src/containment/check-containment.ts'),
    "import { verdicts } from '../model/types.ts';\n\nexport const value = verdicts;\n",
  );

  expect(checkImports(ctx.dir).findings).toStrictEqual([
    {
      rule: 'stages',
      file: 'src/containment/check-containment.ts',
      line: 1,
      message: 'stage imports stage: src/containment/check-containment.ts → src/model/types.ts',
    },
  ]);
});

test('it reports a child process import outside the process module', async () => {
  const ctx = await setupTest();

  await Bun.write(
    join(ctx.dir, 'src/config/read-api-key-from-command.ts'),
    "import { spawn } from 'node:child_process';\n\nexport const value = spawn;\n",
  );

  expect(checkImports(ctx.dir).findings).toStrictEqual([
    {
      rule: 'child-process',
      file: 'src/config/read-api-key-from-command.ts',
      line: 1,
      message: 'node:child_process outside src/process/',
    },
  ]);
});
