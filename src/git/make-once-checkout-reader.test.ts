import { expect, mock, test } from 'bun:test';
import { buildStubCheckoutReader } from '../../test-utils/build-stub-checkout-reader.ts';
import { makeOnceCheckoutReader } from './make-once-checkout-reader.ts';

test('it looks a directory up once and answers every later lookup from the first', async () => {
  const find = mock(buildStubCheckoutReader({ '/work/app': '/work/app.git' }).readCheckout);
  const findOnce = makeOnceCheckoutReader(find);

  const first = await findOnce('/work/app', {});
  const second = await findOnce('/work/app', {});

  expect(second).toBe(first);
  expect(find).toHaveBeenCalledOnce();
});

test('it looks each directory up on its own', async () => {
  const find = mock(
    buildStubCheckoutReader({ '/work/app': '/work/app.git', '/work/other': '/work/other.git' })
      .readCheckout,
  );

  const findOnce = makeOnceCheckoutReader(find);

  await findOnce('/work/app', {});

  const other = await findOnce('/work/other', {});

  expect(other).toStrictEqual({
    worktree: '/work/other',
    gitDir: '/work/other.git',
    commonDir: '/work/other.git',
  });

  expect(find).toHaveBeenCalledTimes(2);
});
