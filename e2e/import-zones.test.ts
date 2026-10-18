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

  const directory = await realpath(created);

  // the rule roots its globs at the nearest .git, so the tree is a repo of its own
  runGit(directory, ['init', '-q']);

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
    await mkdir(dirname(join(directory, path)), { recursive: true });
    await writeFile(join(directory, path), content);
  }

  return {
    lint: async (target) => {
      const args = [
        join(root, 'node_modules', '.bin', 'oxlint'),
        '-c',
        '.oxlintrc.json',

        // under GITHUB_ACTIONS oxlint would print annotations instead
        '--format',
        'default',
        '--report-unused-disable-directives-severity',
        'error',
        target,
      ];

      const child = Bun.spawn(args, { cwd: directory, stdout: 'pipe', stderr: 'pipe' });

      const [exitCode, stdout] = await Promise.all([
        child.exited,
        new Response(child.stdout).text(),
      ]);

      return { exitCode, stdout };
    },
  };
}

interface ViolationCase {
  readonly rule: string;
  readonly file: string;
  readonly source: string;
  readonly other: string;
  readonly otherSource: string;
}

test.each<ViolationCase>([
  {
    rule: 'zone-assignment',
    file: 'src/stray/run.ts',
    source: 'export const value = 1;\n',
    other: 'src/index.ts',
    otherSource: '',
  },
  {
    rule: 'unresolved',
    file: 'src/rules/classify.ts',
    source: "import { gone } from './gone.ts';\n",
    other: 'src/index.ts',
    otherSource: '',
  },
  {
    rule: 'src-mods-apart',
    file: 'src/request/render.ts',
    source: "import { hook } from '../../mods/auto-mode/hooks/hook.ts';\n",
    other: 'mods/auto-mode/hooks/hook.ts',
    otherSource: 'export const hook = 1;\n',
  },
  {
    rule: 'src-mods-apart',
    file: 'src/request/render.test.ts',
    source: "import { hook } from '../../mods/auto-mode/hooks/hook.ts';\n",
    other: 'mods/auto-mode/hooks/hook.ts',
    otherSource: 'export const hook = 1;\n',
  },
  {
    rule: 'src-mods-apart',
    file: 'mods/auto-mode/hooks/register.ts',
    source: "import { render } from 'auto-mode';\n",
    other: 'src/index.ts',
    otherSource: 'export const render = 1;\n',
  },
  {
    rule: 'core-no-tooling',
    file: 'src/rules/classify.ts',
    source: "import { waitFor } from '../../test-utils/wait-for.ts';\n",
    other: 'test-utils/wait-for.ts',
    otherSource: 'export const waitFor = 1;\n',
  },
  {
    rule: 'network',
    file: 'src/rules/classify.ts',
    source: "import { request } from 'node:https';\n",
    other: 'src/index.ts',
    otherSource: '',
  },
  {
    rule: 'network',
    file: 'src/rules/classify.ts',
    source: "await fetch('https://x.test');\n",
    other: 'src/index.ts',
    otherSource: '',
  },
  {
    rule: 'mod',
    file: 'mods/auto-mode/hooks/register.ts',
    source: "import { waitFor } from '../../../test-utils/wait-for.ts';\n",
    other: 'test-utils/wait-for.ts',
    otherSource: 'export const waitFor = 1;\n',
  },
  {
    rule: 'contract',
    file: 'mods/auto-mode/contract/types.ts',
    source: "import { hook } from '../hooks/hook.ts';\n",
    other: 'mods/auto-mode/hooks/hook.ts',
    otherSource: 'export const hook = 1;\n',
  },
  {
    rule: 'request',
    file: 'src/request/render.ts',
    source: "import { config } from '../config/config.ts';\n",
    other: 'src/config/config.ts',
    otherSource: 'export const config = 1;\n',
  },
  {
    rule: 'support',
    file: 'src/config/read-config.ts',
    source: "import { find } from '../containment/find.ts';\n",
    other: 'src/containment/find.ts',
    otherSource: 'export const find = 1;\n',
  },
  {
    rule: 'stages',
    file: 'src/bypass/try-edit.ts',
    source: "import { find } from '../containment/find.ts';\n",
    other: 'src/containment/find.ts',
    otherSource: 'export const find = 1;\n',
  },
  {
    rule: 'stages',
    file: 'src/judge/send-judge-message.ts',
    source: "import { sendDecision } from '../model/send-decision.ts';\n",
    other: 'src/model/send-decision.ts',
    otherSource: 'export const sendDecision = 1;\n',
  },
  {
    rule: 'child-process',
    file: 'src/rules/classify.ts',
    source: "import { spawn } from 'node:child_process';\n",
    other: 'src/index.ts',
    otherSource: '',
  },
])('it fails lint on a $rule violation in $file', async (row) => {
  const ctx = await setupTest({ [row.file]: row.source, [row.other]: row.otherSource });
  const result = await ctx.lint(row.file);

  expect(result.exitCode).toBe(1);
  expect(result.stdout).toInclude(`zgeoff(import-zones): ${row.rule}: `);
});

interface AllowedCase {
  readonly label: string;
  readonly file: string;
  readonly source: string;
  readonly other: string;
  readonly otherSource: string;
}

test.each<AllowedCase>([
  {
    label: 'a stage that imports a support module',
    file: 'src/bypass/try-edit.ts',
    source: "import { config } from '../config/config.ts';\n",
    other: 'src/config/config.ts',
    otherSource: 'export const config = 1;\n',
  },
  {
    label: 'a judge file that imports the Messages client',
    file: 'src/judge/send-judge-message.ts',
    source: "import { sendMessage } from '../messages/anthropic-client.ts';\n",
    other: 'src/messages/anthropic-client.ts',
    otherSource: 'export const sendMessage = 1;\n',
  },
  {
    label: 'a stage that imports its own folder',
    file: 'src/bypass/try-edit.ts',
    source: "import { find } from './find.ts';\n",
    other: 'src/bypass/find.ts',
    otherSource: 'export const find = 1;\n',
  },
  {
    label: 'a type-only import of a types file across stages',
    file: 'src/bypass/try-edit.ts',
    source: "import type { Finding } from '../containment/types.ts';\n",
    other: 'src/containment/types.ts',
    otherSource: 'export type Finding = string;\n',
  },
  {
    label: 'a file under src/ that imports the contract',
    file: 'src/request/render.ts',
    source: "import type { Verdict } from '../../mods/auto-mode/contract/verdict.ts';\n",
    other: 'mods/auto-mode/contract/verdict.ts',
    otherSource: 'export type Verdict = string;\n',
  },
  {
    label: 'a fetch call inside the model module',
    file: 'src/model/send.ts',
    source: "await fetch('https://x.test');\n",
    other: 'src/index.ts',
    otherSource: '',
  },
  {
    label: 'a child process inside the process module',
    file: 'src/process/run.ts',
    source: "import { spawn } from 'node:child_process';\n",
    other: 'src/index.ts',
    otherSource: '',
  },
  {
    label: 'a test that imports test code',
    file: 'src/rules/classify.test.ts',
    source: "import { waitFor } from '../../test-utils/wait-for.ts';\n",
    other: 'test-utils/wait-for.ts',
    otherSource: 'export const waitFor = 1;\n',
  },
])('it passes $label', async (row) => {
  const ctx = await setupTest({ [row.file]: row.source, [row.other]: row.otherSource });
  const result = await ctx.lint(row.file);

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
