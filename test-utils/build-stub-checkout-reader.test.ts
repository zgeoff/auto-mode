import { expect, test } from 'bun:test';
import { buildStubCheckoutReader } from './build-stub-checkout-reader.ts';

test('it places a listed path in the checkout of its own git directory', async () => {
  const finder = buildStubCheckoutReader({ '/w/app': '/w/app.git' });

  const checkout = await finder.readCheckout('/w/app');

  expect(checkout).toStrictEqual({
    worktree: '/w/app',
    gitDir: '/w/app.git',
    commonDir: '/w/app.git',
  });
});

test('it places an unlisted path in no checkout without a fallback', async () => {
  const finder = buildStubCheckoutReader({ '/w/app': '/w/app.git' });

  const checkout = await finder.readCheckout('/w/other');

  expect(checkout).toBeNull();
});

test('it places an unlisted path in the fallback git directory', async () => {
  const finder = buildStubCheckoutReader({}, '/replay/repository.git');

  const checkout = await finder.readCheckout('/w/other');

  expect(checkout).toStrictEqual({
    worktree: '/w/other',
    gitDir: '/replay/repository.git',
    commonDir: '/replay/repository.git',
  });
});
