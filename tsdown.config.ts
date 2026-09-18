import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts', 'src/cli.ts'],
  format: 'esm',
  platform: 'node',
  target: 'node24',

  // type:module makes .js unambiguously ESM; keep extensions plain (.js/.d.ts).
  fixedExtension: false,
  dts: true,
  clean: true,
  treeshake: true,

  // Bundled, not external. This runs once per tool call, so process start-up is
  // on the critical path: resolving these from node_modules costs 59ms a call
  // against 31ms bundled, and the package ships 206kB rather than 8.8MB.
  deps: { alwaysBundle: ['zod', 'ts-pattern', 'tiny-invariant'] },
});
