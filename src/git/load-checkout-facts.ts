import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { HostEnvironment } from '../config/types.ts';
import { findCheckout } from './find-checkout.ts';
import { loadCheckoutRemotes } from './load-checkout-remotes.ts';
import type { CheckoutFacts, CheckoutFinder } from './types.ts';

interface CheckoutFactsOptions {
  readonly stopDir?: string | undefined;
  readonly findCheckout?: CheckoutFinder | undefined;
}

export async function loadCheckoutFacts(
  cwd: string,
  env: HostEnvironment['env'],
  options: Readonly<CheckoutFactsOptions> = {},
): Promise<CheckoutFacts> {
  const directory = resolve(cwd);
  const stopDir = options.stopDir === undefined ? undefined : resolve(options.stopDir);

  const found =
    options.findCheckout === undefined
      ? findCheckout(directory, env, stopDir)
      : options.findCheckout(directory, env);

  const checkout = await found;

  if (checkout === null) {
    return { cwd: directory, checkout, head: null, remotes: [] };
  }

  const [head, originHead, remotes] = await Promise.all([
    readFile(join(checkout.gitDir, 'HEAD'), 'utf8').catch(() => null),
    readFile(join(checkout.commonDir, 'refs', 'remotes', 'origin', 'HEAD'), 'utf8').catch(
      () => null,
    ),
    loadCheckoutRemotes(checkout.commonDir),
  ]);

  return {
    cwd: directory,
    checkout,
    head:
      head === null
        ? null
        : {
            branch: parseReference(head, 'refs/heads/'),
            defaultBranch:
              originHead === null ? null : parseReference(originHead, 'refs/remotes/origin/'),
          },
    remotes,
  };
}

function parseReference(content: string, prefix: string): string | null {
  const value = content.trim();
  const marker = `ref: ${prefix}`;

  if (!value.startsWith(marker)) {
    return null;
  }

  const branch = value.slice(marker.length);

  return branch !== '' && branch.length <= 256 && !/\s/u.test(branch) ? branch : null;
}
