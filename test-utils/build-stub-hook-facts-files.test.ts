import { expect, test } from 'bun:test';
import { buildStubHookFactsFiles } from './build-stub-hook-facts-files.ts';

test('it reads a listed path as its text', async () => {
  const stub = buildStubHookFactsFiles({ '/srv/harbor/.git/config': '[core]\n\tbare = false\n' });

  const text = await stub.files.readText('/srv/harbor/.git/config', 1024);

  expect(text).toBe('[core]\n\tbare = false\n');
});

test('it reads an unlisted path as null', async () => {
  const stub = buildStubHookFactsFiles({});

  const text = await stub.files.readText('/srv/harbor/.git/config', 1024);

  expect(text).toBeNull();
});

test('it rejects a text longer than the limit', () => {
  const stub = buildStubHookFactsFiles({ '/srv/harbor/.git/config': '[core]\n\tbare = false\n' });

  expect(stub.files.readText('/srv/harbor/.git/config', 8)).rejects.toThrowWithMessage(
    Error,
    /larger than a git config/u,
  );
});

test('it probes a listed path as present and an unlisted one as absent', async () => {
  const stub = buildStubHookFactsFiles({ '/srv/harbor/lefthook.yml': '' });

  const probes = await Promise.all([
    stub.files.probeFile('/srv/harbor/lefthook.yml'),
    stub.files.probeFile('/srv/harbor/lefthook.toml'),
  ]);

  expect(probes).toStrictEqual([true, false]);
});

test('it counts the reads that overlap and the bytes it hands out', async () => {
  const stub = buildStubHookFactsFiles({ '/srv/a.gitconfig': 'ab', '/srv/b.gitconfig': 'cdé' });

  await Promise.all([
    stub.files.readText('/srv/a.gitconfig', 1024),
    stub.files.readText('/srv/b.gitconfig', 1024),
  ]);

  expect(stub.readStats()).toStrictEqual({ peakReads: 2, bytesRead: 6 });
});

test('it counts reads that run one after another as one at a time', async () => {
  const stub = buildStubHookFactsFiles({ '/srv/a.gitconfig': 'ab' });

  await stub.files.readText('/srv/a.gitconfig', 1024);
  await stub.files.readText('/srv/a.gitconfig', 1024);

  expect(stub.readStats()).toStrictEqual({ peakReads: 1, bytesRead: 4 });
});
