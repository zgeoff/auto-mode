import type { Checkout, CheckoutFinder } from './types.ts';

export function makeOnceCheckoutFinder(find: CheckoutFinder): CheckoutFinder {
  const found = new Map<string, Promise<Checkout | null>>();

  return (start, env) => {
    const cached = found.get(start) ?? find(start, env);

    found.set(start, cached);

    return cached;
  };
}
