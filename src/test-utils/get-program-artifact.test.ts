import { expect, test } from 'bun:test';
import { getProgramArtifact } from './get-program-artifact.ts';

test('it returns the file a bun command runs', () => {
  const artifact = getProgramArtifact({ command: ['bun', '/repo/dist/cli.js'], cwd: '/repo' });

  expect(artifact).toBe('/repo/dist/cli.js');
});

test('it throws on an empty command', () => {
  expect(() => getProgramArtifact({ command: [], cwd: '/repo' })).toThrow();
});
