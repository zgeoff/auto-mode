import { expect, test } from 'bun:test';
import { join } from 'node:path';
import * as z from 'zod';

test("it merges the release PR on the branch release-please names after the package's component", async () => {
  const root = import.meta.dirname;

  const workflowText = await Bun.file(join(root, '.github', 'workflows', 'main.yml')).text();
  const configText = await Bun.file(join(root, 'release-please-config.json')).text();
  const manifestText = await Bun.file(join(root, 'package.json')).text();

  const workflow: unknown = Bun.YAML.parse(workflowText);
  const rootPackage = z.object({ component: z.string().optional() });

  const config = z
    .object({ packages: z.object({ '.': rootPackage }) })
    .parse(JSON.parse(configText));

  const manifest = z.object({ name: z.string() }).parse(JSON.parse(manifestText));

  // release-please's node strategy takes the component from the package name, without its scope,
  // unless the config names one.
  const component = config.packages['.'].component ?? manifest.name.replace(/^@[^/]+\//u, '');

  expect(workflow).toMatchObject({
    jobs: {
      release: {
        with: { 'release-branch': `release-please--branches--main--components--${component}` },
      },
    },
  });
});
