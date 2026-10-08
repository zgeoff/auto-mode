export interface StubOutput {
  readonly write: (text: string) => boolean;
  readonly read: () => string;
}

// Stands in for process.stdout or process.stderr: a write that the stream accepts
// returns true, and read gives back everything written so far, in order.
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
