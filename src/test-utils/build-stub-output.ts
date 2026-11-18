export interface StubOutput {
  readonly write: (text: string) => boolean;
  readonly read: () => string;
}

export function buildStubOutput(): StubOutput {
  const chunks: string[] = [];

  return {
    write: (text) => {
      chunks.push(text);

      return true;
    },
    read: () => chunks.join(''),
  };
}
