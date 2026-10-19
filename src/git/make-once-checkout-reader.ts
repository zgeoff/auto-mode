import type { Checkout, CheckoutReader } from './types.ts';

export function makeOnceCheckoutReader(find: CheckoutReader): CheckoutReader {
  const found = new Map<string, Promise<Checkout | null>>();

  return (start, env) => {
    const cached = found.get(start) ?? find(start, env);

    found.set(start, cached);

    return cached;
  };
}
