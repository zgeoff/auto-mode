// Ambient modules cannot use relative import declarations for the host's test API,
// and these signatures copy the host's own, which take a RegExp and a class.
/* oxlint-disable typescript/consistent-type-imports, typescript/prefer-readonly-parameter-types */
declare module 'claude-code/testing' {
  interface AsymmetricMatcher {
    readonly text: string;
  }

  type Constructor = abstract new (...args: never[]) => unknown;

  interface Matchers {
    readonly toBe: (expected: unknown) => void;
    readonly toStrictEqual: (expected: unknown) => void;
    readonly toMatchObject: (expected: object) => void;
    readonly toContain: (item: unknown) => void;
    readonly toContainEqual: (item: unknown) => void;
    readonly toHaveLength: (length: number) => void;
    readonly toHaveProperty: (path: string | readonly string[], value?: unknown) => void;
    readonly toBeUndefined: () => void;
    readonly toBeDefined: () => void;
    readonly toBeNull: () => void;
    readonly toBeTruthy: () => void;
    readonly toBeFalsy: () => void;
    readonly toBeNaN: () => void;
    readonly toBeGreaterThan: (bound: number | bigint) => void;
    readonly toBeGreaterThanOrEqual: (bound: number | bigint) => void;
    readonly toBeLessThan: (bound: number | bigint) => void;
    readonly toBeLessThanOrEqual: (bound: number | bigint) => void;
    readonly toMatch: (pattern: string | RegExp) => void;
    readonly toStartWith: (prefix: string) => void;
    readonly toEndWith: (suffix: string) => void;
    readonly toBeInstanceOf: (expected: Constructor) => void;
    readonly toThrow: (
      expected?: string | RegExp | Constructor | { readonly message: string },
    ) => void;
  }

  type AsyncMatchers = {
    readonly [K in keyof Matchers]: (...args: Parameters<Matchers[K]>) => Promise<void>;
  };

  type Negatable<M> = M & { readonly not: M };

  type Expectation = Negatable<Matchers> & {
    readonly resolves: Negatable<AsyncMatchers>;
    readonly rejects: Negatable<AsyncMatchers>;
  };

  interface Expect {
    (actual: unknown, message?: string): Expectation;
    readonly any: (type: Constructor) => AsymmetricMatcher;
    readonly anything: () => AsymmetricMatcher;
    readonly stringContaining: (text: string) => AsymmetricMatcher;
    readonly stringMatching: (pattern: string | RegExp) => AsymmetricMatcher;
    readonly objectContaining: (shape: object) => AsymmetricMatcher;
    readonly arrayContaining: (items: readonly unknown[]) => AsymmetricMatcher;
  }

  interface MockClock {
    readonly now: () => number;
    readonly advance: (ms: number) => Promise<void>;
    readonly set: (ms: number) => Promise<void>;
    readonly settle: () => Promise<void>;
    readonly sleep: (ms: number) => Promise<void>;
  }

  interface MockClockOptions {
    readonly now?: number;
  }

  interface Mock {
    readonly clock: (on: import('./types.ts').ModOn, options?: MockClockOptions) => MockClock;
  }

  interface TestOptions {
    readonly timeoutMs?: number;
    readonly options?: Readonly<Record<string, unknown>>;
  }

  type TestBody = (
    api: import('./types.ts').ModAPI,
    on: import('./types.ts').ModOn,
  ) => Promise<void> | void;

  export const expect: Expect;
  export const mock: Mock;
  export function test(name: string, body: TestBody): void;
  export function test(name: string, options: TestOptions, body: TestBody): void;
}
