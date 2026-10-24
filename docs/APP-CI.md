# App CI

Genesis ships three reusable GitHub Actions workflows, so an app's CI is a short file that calls
them. Ready-to-copy callers are in [`templates/ci/`](../templates/ci).

| Workflow | What it runs |
|---|---|
| [`app-ci.yml`](../.github/workflows/app-ci.yml) | Install from the lockfile, the app's typecheck, lint and test scripts, `genesis doctor`, and `genesis features check` when the app has a feature registry |
| [`supabase-ci.yml`](../.github/workflows/supabase-ci.yml) | `genesis doctor` with the supabase pack, then `supabase db start` (every migration) and the pgTAP tests (`supabase test db`) |
| [`genesis-upgrade.yml`](../.github/workflows/genesis-upgrade.yml) | Moves every `@marktiderman/genesis*` dependency to one Genesis release, reinstalls, runs the doctor and opens or updates one pull request |

```yaml
# .github/workflows/ci.yml
name: CI
on:
  pull_request:
  push:
    branches: [main]
permissions:
  contents: read
jobs:
  app:
    uses: marktiderman/genesis/.github/workflows/app-ci.yml@<commit sha> # @marktiderman/genesis@X.Y.Z
    with:
      package-manager: pnpm
```

## Which ref to call

Call the workflows at the commit of a Genesis release, never at `@main`.

- Each release of the umbrella package is tagged `@marktiderman/genesis@X.Y.Z` in this repo. Pin
  `uses:` to that tag's commit SHA and name the release in a comment, as above. Find the SHA with:

  ```bash
  git ls-remote https://github.com/marktiderman/genesis 'refs/tags/@marktiderman/genesis@X.Y.Z'
  ```

- Why not `@main`: main changes under you, so a passing build can fail tomorrow with no change of
  yours, and whatever lands on main runs in your CI the moment it lands.
- Why a SHA rather than the tag: a tag can be moved and a commit can't, and the tag's name
  (`@` and `/` in it) is awkward in a `uses:` ref.
- Keep the ref on the release your packages are on. When the weekly upgrade pull request moves your
  packages to X.Y.Z, move the workflow SHA to X.Y.Z's commit in the same pull request. The upgrade
  workflow can't do that part: the default `GITHUB_TOKEN` may not edit workflow files.

The workflows are in a release from the first umbrella release cut after they reach `main`.

## app-ci

The app needs a committed lockfile and `@marktiderman/genesis-cli` in its devDependencies (the
doctor and the features check run the installed CLI, so CI checks against the Genesis the app
installed).

| Input | Default | |
|---|---|---|
| `package-manager` | `pnpm` | `pnpm`, `bun` or `npm`. Installs are frozen: `pnpm install --frozen-lockfile`, `bun install --frozen-lockfile`, `npm ci`, with the store cached. |
| `package-manager-version` | from `packageManager` | pnpm or Bun version. Leave it empty when package.json has `packageManager` (pnpm refuses two different versions). Ignored for npm. |
| `working-directory` | `.` | The app's folder. Its lockfile can be there or in a workspace root above it; the install runs where the lockfile is, the checks run in the app. |
| `node-version` | `22` | |
| `typecheck-script`, `lint-script`, `test-script` | `typecheck`, `lint`, `test` | The package.json scripts to run. A named script the app doesn't have fails the run; pass `""` to skip a step. |
| `doctor` | `true` | `genesis doctor`. `doctor-strict: true` adds `--strict` (warnings fail). |
| `features` | `auto` | `genesis features check` when the app has `src/features.ts`, `features.ts` or features settings; `true` or `false` to force it. On a pull request it also checks `feature:<id>` labels. |
| `timeout-minutes` | `20` | |

Every check runs even when an earlier one failed, so one run reports all of them. The checkout has
full history (file contents fetched on demand), which the doctor's supabase pack needs to compare
migrations with the base branch.

## supabase-ci

Two jobs. The doctor job installs the app and runs `genesis doctor`, after checking that the doctor
config turns the supabase pack on (`"packs": ["supabase"]` in the doctor settings); a config
without it fails rather than passing with no migration rules run. The pack needs a
`@marktiderman/genesis-cli` release that has doctor packs, which 1.4.0 doesn't. app-ci's doctor
also runs every pack, so an app that calls both passes `doctor: false` here.

The pgTAP job installs the Supabase CLI (`supabase-version`, default `2.122.0`; a fixed version is
reproducible, `latest` isn't), starts Postgres from every migration and the seed with
`supabase db start`, and runs `supabase test db <tests-path>` (default `supabase/tests`). The
`working-directory` is the folder that holds `supabase/config.toml`.

## genesis-upgrade

The schedule is the caller's (the template runs Mondays at 06:00 UTC, and on demand). Each run:

1. resolves `version` (default `latest`, or an exact version or dist-tag) to one
   `@marktiderman/genesis` release and reads its `dist/versions.json`, the manifest the doctor's
   `version-skew` rule reads;
2. sets every `@marktiderman/genesis*` entry in `dependencies`, `devDependencies` and
   `optionalDependencies` of every tracked package.json at or below `working-directory`: the
   umbrella to the release, packages the manifest lists to their listed version, and other Genesis
   packages (the CLI, studio, supabase) to their npm `latest`. The range prefix (`^`, `~`, exact)
   is kept. `workspace:`, `file:`, `link:` and `npm:` specs, wider ranges, peer dependencies and
   anything already newer are left alone and listed in the pull request;
3. reinstalls, which updates the lockfile, and runs `genesis doctor`;
4. commits the package.json files and the lockfile to `branch` (default `genesis-upgrade`), rebuilt
   from the branch the workflow ran on, and opens or updates one pull request into that branch.
   When nothing changed since the last run the branch is left as it is.

A doctor failure is written into the pull request and fails the run. `dry-run: true` does steps
1 to 3, writes the run summary and pushes nothing.

The job that holds the write token runs no dependency code: the bump, install and doctor run in a
read-only job and hand over a patch, and the pull request job applies it only if it touches
nothing but package.json files and lockfiles.

The caller grants `contents: write` and `pull-requests: write`. With the default `GITHUB_TOKEN`:

- the repository must allow GitHub Actions to create pull requests (Settings, Actions, General,
  "Allow GitHub Actions to create and approve pull requests");
- a pull request it opens doesn't start other workflows, so CI won't run on it until someone
  pushes. Pass a `token` secret (a fine-grained token or a GitHub App token with contents and pull
  requests write) to have CI run on it.

## Security

- No input is written into a script: every input and `github.*` value reaches a shell through
  `env:`, so a script name, path or label can't inject a command.
- Each job asks for the least it needs: `contents: read`, except the upgrade's pull request job.
  A reusable workflow can only lower the caller's token, so the caller grants at most what the
  templates show.
- Third-party actions are pinned to full commit SHAs, with the release in a comment.
- The checkouts don't keep the token (`persist-credentials: false`), except in the upgrade's pull
  request job, which pushes.
- app-ci and supabase-ci refuse to run under `pull_request_target`, which would run a pull
  request's code with the base repository's token and secrets.
- Concurrency groups: a newer push to a pull request cancels the older run; pushes to a branch are
  never cancelled, and two upgrade runs never push the same branch at once.

## Testing these workflows

[`ci-templates-self-test.yml`](../.github/workflows/ci-templates-self-test.yml) calls `app-ci` (with
pnpm, Bun and npm) and `supabase-ci` against the fixture app in
[`.github/ci-fixture`](../.github/ci-fixture) on every pull request that changes them. The
fixture installs the published Genesis packages and leaves out genesis-ui's React peers, which the
doctor doesn't need. `genesis-upgrade` isn't in the self-test, because its pull request job needs a
write token: try a change to it from a scratch repository with `dry-run: true` first.

Validate edits locally with `actionlint .github/workflows/*.yml templates/ci/*.yml`.
