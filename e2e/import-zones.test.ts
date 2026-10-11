import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import * as z from 'zod';
import { runGit } from '../test-utils/run-git.ts';

// Lints a temp tree with the zgeoff/import-zones options from the repo's own
// .oxlintrc.json, so each boundary the config declares fails a real import.
async function setupTest(files: Readonly<Record<string, string>>): Promise<{
  readonly lint: (
    target: string,
  ) => Promise<{ readonly exitCode: number; readonly stdout: string }>;
}> {
  const root = join(import.meta.dirname, '..');

  const created = await mkdtemp(join(tmpdir(), 'auto-mode-import-zones-'));

  onTestFinished(() => rm(created, { recursive: true, force: true }));

  const dir = await realpath(created);

  // the rule roots its globs at the nearest .git, so the tree is a repo of its own
  runGit(dir, ['init', '-q']);

  const text = await Bun.file(join(root, '.oxlintrc.json')).text();

  const parsed: unknown = Bun.JSONC.parse(text);

  const config = z
    .object({ rules: z.object({ 'zgeoff/import-zones': z.unknown() }) })
    .parse(parsed);

  const lintConfig = {
    jsPlugins: [join(root, 'node_modules', '@zgeoff', 'oxlint-config', 'plugin.js')],
    rules: { 'zgeoff/import-zones': config.rules['zgeoff/import-zones'] },
  };

  const manifest = {
    name: 'auto-mode',
    exports: { '.': { 'auto-mode-eval': './src/index.ts', default: './dist/index.js' } },
  };

  const tree = {
    ...files,
    '.oxlintrc.json': JSON.stringify(lintConfig),
    'package.json': JSON.stringify(manifest),
  };

  for (const [path, content] of Object.entries(tree)) {
    await mkdir(dirname(join(dir, path)), { recursive: true });
    await writeFile(join(dir, path), content);
  }

  return {
    lint: async (target) => {
      const args = [
        join(root, 'node_modules', '.bin', 'oxlint'),
        '-c',
        '.oxlintrc.json',
        '--report-unused-disable-directives-severity',
        'error',
        target,
      ];

      const proc = Bun.spawn(args, { cwd: dir, stdout: 'pipe', stderr: 'pipe' });

      const [exitCode, stdout] = await Promise.all([proc.exited, new Response(proc.stdout).text()]);

      return { exitCode, stdout };
    },
  };
}

test.each([
  ['zone-assignment', 'src/stray/run.ts', 'export const value = 1;\n', 'src/index.ts', ''],
  [
    'unresolved',
    'src/rules/classify.ts',
    "import { gone } from './gone.ts';\n",
    'src/index.ts',
    '',
  ],
  [
    'src-mods-apart',
    'src/request/render.ts',
    "import { hook } from '../../mods/auto-mode/hooks/hook.ts';\n",
    'mods/auto-mode/hooks/hook.ts',
    'export const hook = 1;\n',
  ],
  [
    'src-mods-apart',
    'src/request/render.test.ts',
    "import { hook } from '../../mods/auto-mode/hooks/hook.ts';\n",
    'mods/auto-mode/hooks/hook.ts',
    'export const hook = 1;\n',
  ],
  [
    'src-mods-apart',
    'mods/auto-mode/hooks/register.ts',
    "import { render } from 'auto-mode';\n",
    'src/index.ts',
    'export const render = 1;\n',
  ],
  [
    'core-no-tooling',
    'src/rules/classify.ts',
    "import { waitFor } from '../../test-utils/wait-for.ts';\n",
    'test-utils/wait-for.ts',
    'export const waitFor = 1;\n',
  ],
  [
    'network',
    'src/rules/classify.ts',
    "import { request } from 'node:https';\n",
    'src/index.ts',
    '',
  ],
  ['network', 'src/rules/classify.ts', "await fetch('https://x.test');\n", 'src/index.ts', ''],
  [
    'mod',
    'mods/auto-mode/hooks/register.ts',
    "import { waitFor } from '../../../test-utils/wait-for.ts';\n",
    'test-utils/wait-for.ts',
    'export const waitFor = 1;\n',
  ],
  [
    'contract',
    'mods/auto-mode/contract/types.ts',
    "import { hook } from '../hooks/hook.ts';\n",
    'mods/auto-mode/hooks/hook.ts',
    'export const hook = 1;\n',
  ],
  [
    'request',
    'src/request/render.ts',
    "import { config } from '../config/config.ts';\n",
    'src/config/config.ts',
    'export const config = 1;\n',
  ],
  [
    'support',
    'src/config/read-config.ts',
    "import { find } from '../containment/find.ts';\n",
    'src/containment/find.ts',
    'export const find = 1;\n',
  ],
  [
    'stages',
    'src/bypass/try-edit.ts',
    "import { find } from '../containment/find.ts';\n",
    'src/containment/find.ts',
    'export const find = 1;\n',
  ],
  [
    'child-process',
    'src/rules/classify.ts',
    "import { spawn } from 'node:child_process';\n",
    'src/index.ts',
    '',
  ],
])('it fails lint on a %s violation in %s', async (rule, file, source, other, otherSource) => {
  const ctx = await setupTest({ [file]: source, [other]: otherSource });
  const result = await ctx.lint(file);

  expect(result.exitCode).toBe(1);
  expect(result.stdout).toInclude(`zgeoff(import-zones): ${rule}: `);
});

test.each([
  [
    'a stage that imports a support module',
    'src/bypass/try-edit.ts',
    "import { config } from '../config/config.ts';\n",
    'src/config/config.ts',
    'export const config = 1;\n',
  ],
  [
    'a stage that imports its own folder',
    'src/bypass/try-edit.ts',
    "import { find } from './find.ts';\n",
    'src/bypass/find.ts',
    'export const find = 1;\n',
  ],
  [
    'a type-only import of a types file across stages',
    'src/bypass/try-edit.ts',
    "import type { Finding } from '../containment/types.ts';\n",
    'src/containment/types.ts',
    'export type Finding = string;\n',
  ],
  [
    'a file under src/ that imports the contract',
    'src/request/render.ts',
    "import type { Verdict } from '../../mods/auto-mode/contract/verdict.ts';\n",
    'mods/auto-mode/contract/verdict.ts',
    'export type Verdict = string;\n',
  ],
  [
    'a fetch call inside the model module',
    'src/model/send.ts',
    "await fetch('https://x.test');\n",
    'src/index.ts',
    '',
  ],
  [
    'a child process inside the process module',
    'src/process/run.ts',
    "import { spawn } from 'node:child_process';\n",
    'src/index.ts',
    '',
  ],
  [
    'a test that imports test code',
    'src/rules/classify.test.ts',
    "import { waitFor } from '../../test-utils/wait-for.ts';\n",
    'test-utils/wait-for.ts',
    'export const waitFor = 1;\n',
  ],
])('it passes %s', async (_label, file, source, other, otherSource) => {
  const ctx = await setupTest({ [file]: source, [other]: otherSource });
  const result = await ctx.lint(file);

  expect(result.exitCode).toBe(0);
});

test('it fails lint on a disable comment whose import no longer breaks a zone', async () => {
  const source = [
    '// oxlint-disable-next-line zgeoff/import-zones -- GEO-1 moves this import',
    "import { config } from '../config/config.ts';",
    '',
  ].join('\n');

  const ctx = await setupTest({
    'src/bypass/try-edit.ts': source,
    'src/config/config.ts': 'export const config = 1;\n',
  });

  const result = await ctx.lint('src/bypass/try-edit.ts');

  expect(result.exitCode).toBe(1);
  expect(result.stdout).toInclude('Unused oxlint-disable directive');
});
