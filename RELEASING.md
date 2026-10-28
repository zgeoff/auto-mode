# Releasing

Releases run off `main` via [release-please](https://github.com/googleapis/release-please) plus an
OIDC npm publish step in `.github/workflows/main.yml`. No npm token lives in CI. This mirrors
[zgeoff/atc](https://github.com/zgeoff/atc/blob/main/RELEASING.md).

## Flow

1. A `feat:` or `fix:` pull request merges to `main`.
2. The `release` job of `main.yml` calls the shared release-please workflow in zgeoff/tools. It
   opens or updates the release pull request: a version bump per conventional-commit type,
   `CHANGELOG.md`, and the manifest. No lockfile repair is needed: `bun.lock` records dependency
   versions but not the package's own, so the bump leaves it valid.
3. The same job merges the release pull request once its checks pass, and tags the merge
   `auto-mode-vX.Y.Z` with a GitHub release.
4. The `release-dispatch` job checks npm for the version the release job tagged and for the version
   the run's commit holds. For each one that npm lacks and that has a tag, it dispatches `main.yml`
   at the tag with `republish=true`. Every push run does this, so the run of the release commit's
   own push, or any later push, dispatches a release that an earlier run tagged but did not publish.
5. In the dispatched run, the `release-publish` job waits for that run's checks, then runs
   `npm publish --provenance` under OIDC. npm provenance records the run's own commit as the source,
   so only a run at the tagged commit publishes.

A newer push to `main` cancels the older run's checks and nothing else. The release, dispatch and
publish jobs never cancel, and the checks of a run at a tag sit in their own group, so no push
cancels them.

## One-time setup

### GitHub App, for the automated chain

`GITHUB_TOKEN` events do not trigger workflows, so a release pull request it creates gets no CI, and
merging it would never start the publish run. The workflow uses a GitHub App token instead. Without
the App, release pull requests are still created but you merge them by hand.

1. GitHub → Settings → Developer settings → GitHub Apps → New GitHub App, or reuse `zgeoff-release`.
   Any homepage URL. Uncheck "Active" under Webhook.
2. Repository permissions: Contents read and write, Pull requests read and write. Save, then install
   the App on `zgeoff/auto-mode`.
3. Generate a private key, which downloads a `.pem`. In the repository settings add:
   - Actions variable `RELEASE_APP_ID` — the App's client ID
   - Actions secret `RELEASE_APP_PRIVATE_KEY` — the `.pem` contents
4. Settings → Actions → General → check "Allow GitHub Actions to create and approve pull requests".

### First publish

npm trusted publishing cannot create a package that does not exist yet, so the first publish is
manual and OIDC takes over after it. From a machine logged in with `npm login`, publish the current
version:

```sh
bun install --frozen-lockfile
bun run check
bun pm pack
npm publish ./*.tgz --access public
```

Then open the package's access page on npmjs.com and add a trusted publisher: GitHub Actions, user
`zgeoff`, repository `auto-mode`, workflow `main.yml`, and no environment.

## Troubleshooting

- **Release pull request open but nothing published.** The App is not configured, its token step
  failed, or the pull request's checks ran past the release job's wait, so it did not merge. Merging
  it by hand from the GitHub UI works: the run of that merge's push tags the release and dispatches
  the publish.
- **`npm publish` returns 404 or 403 on the first CI release.** The trusted publisher is not
  configured, or the first manual publish never happened.
- **Tagged and released on GitHub but the npm publish failed.** The next push to `main` dispatches
  the publish again. To publish without waiting, dispatch it yourself:

  ```sh
  gh workflow run main.yml --ref auto-mode-vX.Y.Z -f republish=true
  ```

  A dispatch at `main` instead of the tag dispatches again at the tag of the version `main` holds. A
  version the registry holds is skipped.

- **A merged release pull request stays untagged.** The release job fails with
  `its merge commit <sha> is no longer main's head`: the release App cannot tag a merge commit once
  `main` holds a later workflow change, and a person's token, which holds the workflow scope, has
  to.
  1. Read the release pull request's merge commit: `gh pr view <number> --json mergeCommit`.
  2. Create the release at the merge commit, with its section of `CHANGELOG.md` as the notes:
     `gh release create auto-mode-vX.Y.Z --target <merge commit> --title auto-mode-vX.Y.Z --notes-file <notes>`.
  3. Mark the pull request tagged, so release-please stops retrying it:
     `gh pr edit <number> --remove-label 'autorelease: pending' --add-label 'autorelease: tagged'`.
  4. Publish from the tag: `gh workflow run main.yml --ref auto-mode-vX.Y.Z -f republish=true`.

- **Cutting a specific version.** Put `Release-As: X.Y.Z` in the footer of a commit that lands on
  `main`. With squash merges that means the squash commit body, so pass it explicitly:
  `gh pr merge <n> --squash --body 'Release-As: X.Y.Z'`.
