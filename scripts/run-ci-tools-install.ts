import { appendFile, chmod, mkdir, mkdtemp, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export interface ToolRelease {
  readonly name: string;
  readonly url: string;
  readonly sha256: string;

  // The binary's path inside a .tar.gz download; undefined when the download is the binary.
  readonly member: string | undefined;
}

export interface CIToolsInstallOptions {
  readonly tools: readonly ToolRelease[];
  readonly directory: string;

  readonly download: (url: string) => Promise<Uint8Array>;
}

export async function runCIToolsInstall(options: Readonly<CIToolsInstallOptions>): Promise<void> {
  await mkdir(options.directory, { recursive: true });

  for (const tool of options.tools) {
    const bytes = await options.download(tool.url);

    const sha256 = new Bun.CryptoHasher('sha256').update(bytes).digest('hex');

    if (sha256 !== tool.sha256) {
      throw new Error(`${tool.url} has sha256 ${sha256}, not the pinned ${tool.sha256}`);
    }

    const target = join(options.directory, tool.name);

    await (tool.member === undefined
      ? writeFile(target, bytes)
      : extractMember(bytes, tool.member, target));

    await chmod(target, 0o755);
  }
}

async function extractMember(archive: Uint8Array, member: string, target: string): Promise<void> {
  const scratch = await mkdtemp(`${target}-`);

  try {
    await writeFile(join(scratch, 'archive.tar.gz'), archive);

    await Bun.$`tar -xzf ${join(scratch, 'archive.tar.gz')} -C ${scratch} ${member}`.quiet();

    await rename(join(scratch, member), target);
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}

const gitleaksVersion = '8.30.1';
const shellcheckVersion = '0.11.0';
const shfmtVersion = '3.14.1';
const actionlintVersion = '1.7.12';

// Pinned release binaries, so a lint result does not move with the runner image's preinstalled
// tools. The corpus anonymiser's secret gate runs gitleaks, and its version matches the PR job's
// gitleaks scan.
const releases: readonly ToolRelease[] = [
  {
    name: 'gitleaks',
    url: `https://github.com/gitleaks/gitleaks/releases/download/v${gitleaksVersion}/gitleaks_${gitleaksVersion}_linux_x64.tar.gz`,
    sha256: '551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb',
    member: 'gitleaks',
  },
  {
    name: 'shellcheck',
    url: `https://github.com/koalaman/shellcheck/releases/download/v${shellcheckVersion}/shellcheck-v${shellcheckVersion}.linux.x86_64.tar.gz`,
    sha256: 'b7af85e41cc99489dcc21d66c6d5f3685138f06d34651e6d34b42ec6d54fe6f6',
    member: `shellcheck-v${shellcheckVersion}/shellcheck`,
  },
  {
    name: 'shfmt',
    url: `https://github.com/mvdan/sh/releases/download/v${shfmtVersion}/shfmt_v${shfmtVersion}_linux_amd64`,
    sha256: '76e77641faa025814b77f153b29796b8e6fa2fca03e0c76a691608b86c7ea7bf',
    member: undefined,
  },
  {
    name: 'actionlint',
    url: `https://github.com/rhysd/actionlint/releases/download/v${actionlintVersion}/actionlint_${actionlintVersion}_linux_amd64.tar.gz`,
    sha256: '8aca8db96f1b94770f1b0d72b6dddcb1ebb8123cb3712530b08cc387b349a3d8',
    member: 'actionlint',
  },
];

async function runCLI(): Promise<void> {
  const runnerTemp = process.env['RUNNER_TEMP'];
  const githubPath = process.env['GITHUB_PATH'];

  if (runnerTemp === undefined || githubPath === undefined) {
    process.stderr.write('ci tools: RUNNER_TEMP and GITHUB_PATH must be set\n');

    process.exitCode = 2;

    return;
  }

  const directory = join(runnerTemp, 'ci-tools');

  await runCIToolsInstall({ tools: releases, directory, download: readDownload });
  await appendFile(githubPath, `${directory}\n`);
}

async function readDownload(url: string): Promise<Uint8Array> {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`${url} answered HTTP ${response.status}`);
  }

  const body = await response.arrayBuffer();

  return new Uint8Array(body);
}

if (import.meta.main) {
  await runCLI();
}
