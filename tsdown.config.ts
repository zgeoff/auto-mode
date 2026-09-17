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
});
