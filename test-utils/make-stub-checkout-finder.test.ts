import { expect, test } from 'bun:test';
import { makeStubCheckoutFinder } from './make-stub-checkout-finder.ts';

test('it places a listed path in the checkout of its own git directory', async () => {
  const findCheckout = makeStubCheckoutFinder({ '/w/app': '/w/app.git' });

  const checkout = await findCheckout('/w/app');

  expect(checkout).toStrictEqual({ worktree: '/w/app', commonDir: '/w/app.git' });
});

test('it places an unlisted path in no checkout without a fallback', async () => {
  const findCheckout = makeStubCheckoutFinder({ '/w/app': '/w/app.git' });

  const checkout = await findCheckout('/w/other');

  expect(checkout).toBeNull();
});

test('it places an unlisted path in the fallback git directory', async () => {
  const findCheckout = makeStubCheckoutFinder({}, '/replay/repository.git');

  const checkout = await findCheckout('/w/other');

  expect(checkout).toStrictEqual({ worktree: '/w/other', commonDir: '/replay/repository.git' });
});
