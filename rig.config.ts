import { defineRig } from '@zgeoff/rig';

export default defineRig({
  programs: {
    'auto-mode': {
      package: '.',
      source: 'src/cli.ts',
      build: 'bun run build',
      artifact: 'dist/cli.js',
    },
  },
});
