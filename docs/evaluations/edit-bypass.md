# Edit bypass evidence

GEO-157 lets an in-scope file edit skip Jev unless a secret scan matches. This report covers the
scan, a port of the Betterleaks v1.9.0 rule set, and what the bypass does to real traffic. No
request was sent.

## Result

- **The port matches Betterleaks on its own samples.** It finds all 7,938 true positives and drops
  810 of 856 false positives. The other 46 are filters it cannot run, so it reports more than
  Betterleaks, never less.
- **The scan reads 100 KB in about 18 ms under node.** The first call adds about 12 ms of regex
  compilation. A Read call pays nothing, because only an edit that reaches the bypass loads the rule
  set.
- **83 of the 232 real actions skip Jev.** 86 qualify by target. The scan sends 3 of those to Jev,
  each a credential-shaped test value.

## The port

[`scripts/build-secret-rules.ts`](../../scripts/build-secret-rules.ts) compiles
`config/betterleaks.toml` from Betterleaks v1.9.0 (commit `81aff7a6`, MIT) into
[`src/secrets/betterleaks-rules.json`](../../src/secrets/betterleaks-rules.json). The JSON keeps the
MIT notice, and the notice ships inside the bundle. The source TOML is not committed; the build
script reads it from a Betterleaks checkout.

- **Regexes.** 216 rule patterns change under six translations: a leading flag to a JS flag, a
  mid-pattern flag to a modifier group (one per alternative, as RE2 reads it), `(?P<` to `(?<`, `\z`
  to `$`, `\A` to `^`, and POSIX classes. Untranslated, V8 reads `\z` as a literal `z`.
- **re2js.** Five rules backtrack quadratically under V8 on hostile input: `ebay-client-id`,
  `auth0-domain.1`, `snowflake-account-host.1`, `curl-auth-user`, and `curl-auth-header`. They run
  on re2js from their original RE2 source. The two curl rules read only windows that open at each
  `curl`, because their patterns cannot match past 11 newlines from it.
- **Filters.** A filter drops a finding when any term holds. Entropy, `matchesAny`, `containsAny`,
  and `let` bindings of those port. The token-ratio term needs a 1.1 MB tokenizer and is left out
  (123 terms). So are 50 terms of the four generic rules that need computed context. Leaving a term
  out reports more findings, never fewer.
- **Composites.** The 43 rules that Betterleaks never reports alone, such as a client ID, are not
  scanned. The 36 composite rules report on their primary match without the parts they require,
  which again reports more.
- **Not ported.** Live validation, which sends the secret to its provider; the `gitleaks:allow`
  comment, which the agent could write itself; and decoding of encoded segments.

## Samples

[`scripts/check-secret-rules.ts`](../../scripts/check-secret-rules.ts) runs each rule over the true
and false positives that Betterleaks' generator validates it against
(`cmd/generate/config/rules/*.go`). The samples were dumped from the generator at the same commit,
which rebuilt the TOML byte for byte. They stay out of the repository: they hold 7,938
realistic-looking tokens, and some encode people's names.

| Samples         | Total | Port agrees | Port differs                                         |
| --------------- | ----- | ----------- | ---------------------------------------------------- |
| True positives  | 7,938 | 7,938       | 0                                                    |
| False positives | 856   | 810         | 46 reported (45 generic-api-key, 1 apollo-api-key.1) |

Each of the 46 depends on a term that is left out: the generic-api-key context and token-efficiency
checks, and Apollo's token ratio.

## Cost

[`src/secrets/find-secret.bench.ts`](../../src/secrets/find-secret.bench.ts), run with
`bun run bench`, scans this repository's own non-test source, which is full of the words the keyword
prefilter keys on. The table holds three runs of its earlier script form under node 24.13:

| Measure                             | Result       |
| ----------------------------------- | ------------ |
| Load the rule set and re2js         | 8.5–10.6 ms  |
| First scan of 100 KB                | 28.7–32.0 ms |
| Later scans of 100 KB, median of 7  | 17.4–18.8 ms |
| Scan of 1 MB, median of 7           | 164–174 ms   |
| 20 KB of `curl -H` repeats on re2js | 5.2–7.0 ms   |

The bypass reads at most 256 KiB, so the worst scan costs about 45 ms; larger content goes to Jev.
The built CLI under node, 20 runs each against the same build of `main`:

| Call                              | `main`                          | This change           |
| --------------------------------- | ------------------------------- | --------------------- |
| Read (local allow)                | 43–45 ms                        | 41–42 ms              |
| Edit (Jev on `main`, bypass here) | 43–44 ms to the failed Jev call | 51–52 ms to the allow |

## Real traffic

[The replay test](../../evals/replay/edit-bypass.test.ts) classifies GEO-104's 232 approved real
actions against each action's cwd scope. The corpus holds no file content, so each Edit is scanned
as its own replacement text, without the 12 lines the product reads around it.

| Outcome                                   | Actions |
| ----------------------------------------- | ------- |
| Not a file-tool edit                      | 136     |
| Bypassed                                  | 83      |
| Secret scan match, sent to Jev            | 3       |
| Target in a nested worktree outside scope | 2       |
| Target outside every in-scope worktree    | 8       |

The 3 matches are fixtures in a sanitizer's tests, such as a URL with a demo user and password and a
JSON password field. Betterleaks reports them as well. The 8 outside targets are scratch files under
`/tmp`, and the 2 nested targets belong to a worktree the coordinator prepared, which the atc scope
source would own.
