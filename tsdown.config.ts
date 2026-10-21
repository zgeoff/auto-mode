import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { defineConfig } from 'tsdown';
import { BETTERLEAKS_RULES } from './src/secrets/betterleaks-rules.ts';

export default defineConfig({
  entry: ['src/index.ts', 'src/cli.ts'],
  format: 'esm',
  platform: 'node',
  target: 'node24',

  // type:module makes .js unambiguously ESM; keep extensions plain (.js/.d.ts).
  fixedExtension: false,

  // tsrs writes the declarations: the dts plugin runs it as a custom
  // executable for its tsgo generator.
  dts: { generator: 'tsgo', tsgo: { path: join(import.meta.dirname, 'node_modules/.bin/tsrs') } },
  clean: true,
  treeshake: true,

  // Bundled, not external. This runs once per tool call, so process start-up is
  // on the critical path: resolving these from node_modules costs 59ms a call
  // against 31ms bundled, and the package ships 206kB rather than 8.8MB.
  deps: { alwaysBundle: ['zod', 'ts-pattern', 'tiny-invariant', 're2js', 'gunshi'] },

  hooks: {
    'build:done': async (ctx) => {
      await writeFile(
        join(ctx.options.outDir, 'secret-rules.json'),
        `${JSON.stringify(BETTERLEAKS_RULES)}\n`,
      );
    },
  },
});
