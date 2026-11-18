type Environment = Readonly<Record<string, string | undefined>>;

// `run` and `start` from @zgeoff/testing/process add their env to the test process's, so this
// unsets every other host variable, and the child sees only what the test names.
export function buildIsolatedEnv(host: Environment, kept: Environment): Environment {
  const unset = Object.fromEntries(Object.keys(host).map((name) => [name, undefined]));

  return { ...unset, ...kept };
}
