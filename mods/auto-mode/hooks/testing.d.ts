// Ambient modules cannot use relative import declarations for the host's test API.
/* oxlint-disable typescript/consistent-type-imports */
declare module 'claude-code/testing' {
  interface Matchers {
    readonly toStrictEqual: (expected: unknown) => void;
    readonly toMatchObject: (expected: unknown) => void;
    readonly toBe: (expected: unknown) => void;
    readonly toBeGreaterThan: (expected: number) => void;
    readonly toBeLessThanOrEqual: (expected: number) => void;
  }

  interface Expect {
    (actual: unknown): Matchers;
    readonly any: (type: unknown) => unknown;
  }

  interface TestOptions {
    readonly options: Readonly<Record<string, unknown>>;
  }

  export const expect: Expect;
  export function test(
    name: string,
    body: (
      api: import('./types.ts').ModAPI,
      on: import('./types.ts').ModOn,
    ) => Promise<void> | void,
  ): void;
  export function test(
    name: string,
    options: TestOptions,
    body: (
      api: import('./types.ts').ModAPI,
      on: import('./types.ts').ModOn,
    ) => Promise<void> | void,
  ): void;
}
