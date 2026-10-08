import { expect, test } from 'bun:test';
import { buildStubCheckoutFinder } from './build-stub-checkout-finder.ts';

test('it places a listed path in the checkout of its own git directory', async () => {
  const finder = buildStubCheckoutFinder({ '/w/app': '/w/app.git' });

  const checkout = await finder.findCheckout('/w/app');

  expect(checkout).toStrictEqual({ worktree: '/w/app', commonDir: '/w/app.git' });
});

test('it places an unlisted path in no checkout without a fallback', async () => {
  const finder = buildStubCheckoutFinder({ '/w/app': '/w/app.git' });

  const checkout = await finder.findCheckout('/w/other');

  expect(checkout).toBeNull();
});

test('it places an unlisted path in the fallback git directory', async () => {
  const finder = buildStubCheckoutFinder({}, '/replay/repository.git');

  const checkout = await finder.findCheckout('/w/other');

  expect(checkout).toStrictEqual({ worktree: '/w/other', commonDir: '/replay/repository.git' });
});
