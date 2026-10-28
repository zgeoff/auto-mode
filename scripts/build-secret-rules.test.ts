import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import invariant from 'tiny-invariant';

async function setupTest(): Promise<{ readonly directory: string }> {
  const directory = await mkdtemp(join(tmpdir(), 'build-secret-rules-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return { directory };
}

test('it writes the rule set as a module that exports it under its type', async () => {
  const ctx = await setupTest();

  const out = join(ctx.directory, 'betterleaks-rules.ts');

  await writeFile(
    join(ctx.directory, 'betterleaks.toml'),
    [
      `prefilter = '''matchesAny(finding["path"], [\`\\.lock$\`])'''`,
      `filter = '''entropy(finding["secret"]) <= 3.0'''`,
      '',
      '[[rules]]',
      'id = "example-token"',
      String.raw`regex = '''\bexm_[a-z0-9]{8}\b'''`,
      'keywords = ["EXM_"]',
      `filter = '''containsAny(finding["secret"], ["exm_00000000"])'''`,
      '',
      '[[rules]]',
      'id = "example-file"',
      String.raw`path = '''(?i)\.example$'''`,
      'skipReport = true',
      '',
    ].join('\n'),
  );

  await writeFile(join(ctx.directory, 'LICENSE'), 'MIT License\n\nExample notice.\n');

  const result = Bun.spawnSync(
    [
      process.execPath,
      join(import.meta.dirname, 'build-secret-rules.ts'),
      '--config',
      join(ctx.directory, 'betterleaks.toml'),
      '--license',
      join(ctx.directory, 'LICENSE'),
      '--version',
      'v0.0.1',
      '--commit',
      'abc123',
      '--out',
      out,
    ],
    { env: { PATH: process.env['PATH'] } },
  );

  const text = await readFile(out, 'utf8');
  const exported: unknown = await import(out);

  invariant(typeof exported === 'object' && exported !== null, 'the output is a module');

  expect({
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  }).toStrictEqual({
    exitCode: 0,
    stdout: '{"rules":2,"reported":1,"re2":[],"unported":0}\n',
    stderr: '',
  });

  expect(text).toStartWith(
    "import type { SecretRuleSet } from './types.ts';\n\nexport const BETTERLEAKS_RULES: SecretRuleSet = {",
  );

  expect({ ...exported }).toStrictEqual({
    BETTERLEAKS_RULES: {
      source: {
        repository: 'https://github.com/betterleaks/betterleaks',
        version: 'v0.0.1',
        commit: 'abc123',
      },
      notice: 'MIT License\n\nExample notice.\n',
      prefilter: [{ source: String.raw`\.lock$`, flags: '', engine: 'js' }],
      filter: [{ kind: 'entropy', op: '<=', value: 3 }],
      rules: [
        {
          id: 'example-token',
          pattern: { source: String.raw`\bexm_[a-z0-9]{8}\b`, flags: '', engine: 'js' },
          path: null,
          keywords: ['exm_'],
          secretGroup: 0,
          filter: [{ kind: 'contains', field: 'secret', values: ['exm_00000000'], negate: false }],
          report: true,
        },
        {
          id: 'example-file',
          pattern: null,
          path: { source: String.raw`\.example$`, flags: 'i', engine: 'js' },
          keywords: [],
          secretGroup: 0,
          filter: [],
          report: false,
        },
      ],
      unported: [],
    },
  });
});

test.each([
  [
    'example-token',
    '_token',
    'example-token matches its own source at a character that is not a literal atom',
  ],
  [
    'example-token',
    '[ab].*',
    'example-token matches its own source at a character that is not a literal atom',
  ],
  ['example-token', 'a|b', 'example-token still matches its own source after the escape'],
  [
    'ebay-client-id',
    '_token',
    'ebay-client-id matches its own source at a character that is not a literal atom',
  ],
  [
    'ebay-client-id',
    '[ab].*',
    'ebay-client-id matches its own source at a character that is not a literal atom',
  ],
  ['ebay-client-id', 'a|b', 'ebay-client-id still matches its own source after the escape'],
])(
  'it refuses to write the %s rule with the %s pattern, which matches its own source and has no safe escape',
  async (id, regex, message) => {
    const ctx = await setupTest();

    const out = join(ctx.directory, 'betterleaks-rules.ts');

    await writeFile(
      join(ctx.directory, 'betterleaks.toml'),
      [
        `prefilter = '''matchesAny(finding["path"], [\`\\.lock$\`])'''`,
        `filter = '''entropy(finding["secret"]) <= 3.0'''`,
        '',
        '[[rules]]',
        `id = "${id}"`,
        `regex = '''${regex}'''`,
        '',
      ].join('\n'),
    );

    await writeFile(join(ctx.directory, 'LICENSE'), 'MIT License\n\nExample notice.\n');

    const result = Bun.spawnSync(
      [
        process.execPath,
        join(import.meta.dirname, 'build-secret-rules.ts'),
        '--config',
        join(ctx.directory, 'betterleaks.toml'),
        '--license',
        join(ctx.directory, 'LICENSE'),
        '--version',
        'v0.0.1',
        '--commit',
        'abc123',
        '--out',
        out,
      ],
      { env: { PATH: process.env['PATH'] } },
    );

    const written = await Bun.file(out).exists();

    expect(result.exitCode).toBe(1);
    expect(result.stderr.toString()).toInclude(`Invariant failed: ${message}`);
    expect(written).toBe(false);
  },
);

test.each([
  ['example-literal', { source: '[e]xm-literal-key', flags: '', engine: 'js' }],
  ['ebay-client-id', { source: '[e]xm-literal-key', flags: '', engine: 're2' }],
])(
  'it escapes the %s pattern that matches its own source, so a scan of the bundle passes it',
  async (id, pattern) => {
    const ctx = await setupTest();

    const out = join(ctx.directory, 'betterleaks-rules.ts');

    await writeFile(
      join(ctx.directory, 'betterleaks.toml'),
      [
        `prefilter = '''matchesAny(finding["path"], [\`\\.lock$\`])'''`,
        `filter = '''entropy(finding["secret"]) <= 3.0'''`,
        '',
        '[[rules]]',
        `id = "${id}"`,
        `regex = '''exm-literal-key'''`,
        'keywords = ["exm-literal-"]',
        '',
      ].join('\n'),
    );

    await writeFile(join(ctx.directory, 'LICENSE'), 'MIT License\n\nExample notice.\n');

    const result = Bun.spawnSync(
      [
        process.execPath,
        join(import.meta.dirname, 'build-secret-rules.ts'),
        '--config',
        join(ctx.directory, 'betterleaks.toml'),
        '--license',
        join(ctx.directory, 'LICENSE'),
        '--version',
        'v0.0.1',
        '--commit',
        'abc123',
        '--out',
        out,
      ],
      { env: { PATH: process.env['PATH'] } },
    );

    const exported: unknown = await import(out);

    invariant(typeof exported === 'object' && exported !== null, 'the output is a module');

    expect(result.exitCode).toBe(0);

    expect({ ...exported }).toStrictEqual({
      BETTERLEAKS_RULES: {
        source: {
          repository: 'https://github.com/betterleaks/betterleaks',
          version: 'v0.0.1',
          commit: 'abc123',
        },
        notice: 'MIT License\n\nExample notice.\n',
        prefilter: [{ source: String.raw`\.lock$`, flags: '', engine: 'js' }],
        filter: [{ kind: 'entropy', op: '<=', value: 3 }],
        rules: [
          {
            id,
            pattern,
            path: null,
            keywords: ['exm-literal-'],
            secretGroup: 0,
            filter: [],
            report: true,
          },
        ],
        unported: [],
      },
    });
  },
);
