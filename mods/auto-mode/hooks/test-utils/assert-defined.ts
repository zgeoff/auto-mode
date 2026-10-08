// A plugin test loads only the plugin's own files, so the invariant package is
// out of reach and this narrows a maybe-value in its place.
export function assertDefined<T>(value: T | undefined): asserts value is T {
  if (value === undefined) {
    throw new Error('Expected a value, received undefined');
  }
}
