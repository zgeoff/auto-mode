import { expect, mock, test } from 'bun:test';
import { buildStubCheckoutFinder } from '../../test-utils/build-stub-checkout-finder.ts';
import { makeOnceCheckoutFinder } from './make-once-checkout-finder.ts';

test('it looks a directory up once and answers every later lookup from the first', async () => {
  const find = mock(buildStubCheckoutFinder({ '/work/app': '/work/app.git' }).findCheckout);
  const findOnce = makeOnceCheckoutFinder(find);

  const first = await findOnce('/work/app', {});
  const second = await findOnce('/work/app', {});

  expect(second).toBe(first);
  expect(find).toHaveBeenCalledOnce();
});

test('it looks each directory up on its own', async () => {
  const find = mock(
    buildStubCheckoutFinder({ '/work/app': '/work/app.git', '/work/other': '/work/other.git' })
      .findCheckout,
  );

  const findOnce = makeOnceCheckoutFinder(find);

  await findOnce('/work/app', {});

  const other = await findOnce('/work/other', {});

  expect(other).toStrictEqual({
    worktree: '/work/other',
    gitDir: '/work/other.git',
    commonDir: '/work/other.git',
  });

  expect(find).toHaveBeenCalledTimes(2);
});
