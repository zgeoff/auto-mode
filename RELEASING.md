# Releasing

Releases run off `main` via [release-please](https://github.com/googleapis/release-please) plus an
OIDC npm publish step in `.github/workflows/main.yml`. No npm token lives in CI. This mirrors
[zgeoff/atc](https://github.com/zgeoff/atc/blob/main/RELEASING.md).

## Flow

1. A `feat:` or `fix:` pull request merges to `main`.
2. `main.yml` runs release-please, which opens or updates the release pull request: a version bump
   per conventional-commit type, `CHANGELOG.md`, and the manifest. Then it auto-merges. No lockfile
   repair is needed: `bun.lock` records dependency versions but not the package's own, so the bump
   leaves it valid.
3. That merge triggers `main.yml` again: release-please tags `vX.Y.Z`, creates the GitHub release,
   and the publish step runs `npm publish --provenance` under OIDC.

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
manual and OIDC takes over after it:

```sh
npm login
scripts/first-publish.sh
```

The script refuses to run if the package already exists, publishes the current version from your
machine, and then prints the trusted publisher settings to add on npmjs.com.

## Troubleshooting

- **Release pull request open but nothing published.** The App is not configured or its token step
  failed, so the pull request did not auto-merge. Merging it by hand from the GitHub UI works and
  triggers the publish run.
- **`npm publish` returns 404 or 403 on the first CI release.** The trusted publisher is not
  configured, or the first manual publish never happened.
- **Tagged and released on GitHub but the npm publish failed.** Re-run the publish alone:

  ```sh
  gh workflow run main.yml -f republish=true
  ```

  A version already on the registry is skipped.

- **Cutting a specific version.** Put `Release-As: X.Y.Z` in the footer of a commit that lands on
  `main`. With squash merges that means the squash commit body, so pass it explicitly:
  `gh pr merge <n> --squash --body 'Release-As: X.Y.Z'`.
