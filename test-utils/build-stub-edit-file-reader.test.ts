import { expect, test } from 'bun:test';
import { buildStubEditFileReader } from './build-stub-edit-file-reader.ts';

test('it resolves a listed link to its target', async () => {
  const reader = buildStubEditFileReader({
    checkout: '/w/app',
    links: { '/w/app/link.ts': '/w/app/a.ts' },
  });

  const target = await reader.resolveEditTarget('/w/app/link.ts');

  expect(target).toBe('/w/app/a.ts');
});

test('it resolves a path that is no listed link to itself', async () => {
  const reader = buildStubEditFileReader({
    checkout: '/w/app',
    links: { '/w/app/link.ts': '/w/app/a.ts' },
  });

  const target = await reader.resolveEditTarget('/w/app/b.ts');

  expect(target).toBe('/w/app/b.ts');
});

test('it places every directory in the one checkout given', async () => {
  const reader = buildStubEditFileReader({ checkout: '/w/app' });

  const checkout = await reader.findCheckout('/elsewhere', {});

  expect(checkout).toStrictEqual({ worktree: '/w/app', commonDir: '/w/app/.git' });
});

test('it places no directory in a checkout when none is given', async () => {
  const reader = buildStubEditFileReader({ checkout: null });

  const checkout = await reader.findCheckout('/w/app', {});

  expect(checkout).toBeNull();
});

test('it fails every checkout lookup with the checkout error given', () => {
  const reader = buildStubEditFileReader({ checkout: '/w/app', checkoutError: 'git failed' });

  expect(reader.findCheckout('/w/app', {})).rejects.toThrowWithMessage(Error, 'git failed');
});

test('it reads a listed file', async () => {
  const reader = buildStubEditFileReader({
    checkout: '/w/app',
    files: { '/w/app/a.ts': 'export const a = 1;\n' },
  });

  const content = await reader.readFile('/w/app/a.ts');

  expect(content).toBe('export const a = 1;\n');
});

test('it fails to read a file that is not listed', () => {
  const reader = buildStubEditFileReader({
    checkout: '/w/app',
    files: { '/w/app/a.ts': 'export const a = 1;\n' },
  });

  expect(reader.readFile('/w/app/b.ts')).rejects.toMatchObject({
    message: "ENOENT: no such file or directory, open '/w/app/b.ts'",
    errno: -2,
    code: 'ENOENT',
    syscall: 'open',
    path: '/w/app/b.ts',
  });
});
