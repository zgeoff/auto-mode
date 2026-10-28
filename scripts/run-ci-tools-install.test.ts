import { expect, mock, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCIToolsInstall } from './run-ci-tools-install.ts';

async function setupTest(): Promise<{ readonly directory: string }> {
  const directory = await mkdtemp(join(tmpdir(), 'ci-tools-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return { directory };
}

test('it installs the binary from its path inside a downloaded archive', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.directory, 'source', 'widget-v1.2.0'), { recursive: true });

  await writeFile(
    join(ctx.directory, 'source', 'widget-v1.2.0', 'widget'),
    '#!/bin/sh\necho widget\n',
  );

  await Bun.$`tar -czf ${join(ctx.directory, 'widget.tar.gz')} -C ${join(ctx.directory, 'source')} widget-v1.2.0`.quiet();

  const packed = await readFile(join(ctx.directory, 'widget.tar.gz'));

  const archive = new Uint8Array(packed);

  const download = mock(() => Promise.resolve(archive));

  await runCIToolsInstall({
    tools: [
      {
        name: 'widget',
        url: 'https://example.test/widget.tar.gz',
        sha256: new Bun.CryptoHasher('sha256').update(archive).digest('hex'),
        member: 'widget-v1.2.0/widget',
      },
    ],
    directory: join(ctx.directory, 'bin'),
    download,
  });

  const installed = await readFile(join(ctx.directory, 'bin', 'widget'), 'utf8');
  const status = await stat(join(ctx.directory, 'bin', 'widget'));
  const entries = await readdir(join(ctx.directory, 'bin'));

  expect(installed).toBe('#!/bin/sh\necho widget\n');
  expect(status.mode & 0o777).toBe(0o755);
  expect(entries).toStrictEqual(['widget']);
  expect(download).toHaveBeenCalledExactlyOnceWith('https://example.test/widget.tar.gz');
});

test('it installs a download that is the binary itself', async () => {
  const ctx = await setupTest();

  const binary = new TextEncoder().encode('#!/bin/sh\necho gadget\n');

  await runCIToolsInstall({
    tools: [
      {
        name: 'gadget',
        url: 'https://example.test/gadget_linux_amd64',
        sha256: new Bun.CryptoHasher('sha256').update(binary).digest('hex'),
        member: undefined,
      },
    ],
    directory: join(ctx.directory, 'bin'),
    download: () => Promise.resolve(binary),
  });

  const installed = await readFile(join(ctx.directory, 'bin', 'gadget'), 'utf8');
  const status = await stat(join(ctx.directory, 'bin', 'gadget'));

  expect(installed).toBe('#!/bin/sh\necho gadget\n');
  expect(status.mode & 0o777).toBe(0o755);
});

test('it refuses a download whose sha256 is not the pinned one', async () => {
  const ctx = await setupTest();

  const binary = new TextEncoder().encode('#!/bin/sh\necho tampered\n');
  const sha256 = new Bun.CryptoHasher('sha256').update(binary).digest('hex');

  expect(
    runCIToolsInstall({
      tools: [
        {
          name: 'gadget',
          url: 'https://example.test/gadget_linux_amd64',
          sha256: '0'.repeat(64),
          member: undefined,
        },
      ],
      directory: join(ctx.directory, 'bin'),
      download: () => Promise.resolve(binary),
    }),
  ).rejects.toThrowWithMessage(
    Error,
    `https://example.test/gadget_linux_amd64 has sha256 ${sha256}, not the pinned ${'0'.repeat(64)}`,
  );
});
