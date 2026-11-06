# App CI

Genesis ships three reusable GitHub Actions workflows, so an app's CI is a short file that calls
them. Ready-to-copy callers are in [`templates/ci/`](../templates/ci). Previews (web, database and
native) are built on demand: see [Previews](#previews).

A native app's builds, previews, store submissions and over-the-air updates run on EAS Workflows
instead, from files in the app's `.eas/workflows/`: see [NATIVE-RELEASE.md](./NATIVE-RELEASE.md)
and [`templates/eas/`](../templates/eas). The GitHub workflows here still run its typecheck, lint,
tests, doctor and pgTAP tests.

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
  `uses:` to that tag's commit SHA and name the release in a comment, as above. The tags are
  annotated, so ask for the commit the tag points at (`^{}`), not the tag object:

  ```bash
  git ls-remote https://github.com/marktiderman/genesis 'refs/tags/@marktiderman/genesis@X.Y.Z^{}'
  # or
  gh api 'repos/marktiderman/genesis/commits/@marktiderman%2Fgenesis@X.Y.Z' --jq .sha
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
| `typecheck-script`, `lint-script`, `test-script` | `typecheck`, `lint`, `test` | The package.json scripts to run. A named script the app doesn't have fails the run; pass `""` to skip a step. An app made from the native starter needs no change: its `test` runs the vitest file checks and then the jest-expo component tests. |
| `doctor` | `true` | `genesis doctor`. `doctor-strict: true` adds `--strict` (warnings fail). |
| `features` | `auto` | `genesis features check` when the app has `src/features.ts`, `features.ts` or features settings; `true` or `false` to force it. On a pull request it also checks `feature:<id>` labels. |
| `timeout-minutes` | `20` | |
| secret `npm-token` | none | Exposed as `NODE_AUTH_TOKEN` to the install, for an `.npmrc` that reads `${NODE_AUTH_TOKEN}` (private packages). |

Every check runs even when an earlier one failed, so one run reports all of them. The checkout has
full history, which the doctor's supabase pack needs to compare migrations with the base branch.

The `feature:<id>` label check reads the labels the run started with. The template triggers on
pull request pushes only, so after fixing a label, push (or add `labeled` and `unlabeled` to the
caller's `pull_request` types, at the cost of a full run per label change).

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
   packages (the CLI, studio, supabase) to their npm `latest`, even when `version` names an older
   release, since they release on their own. The range prefix (`^`, `~`, exact) is kept.
   `workspace:`, `file:`, `link:` and `npm:` specs, wider ranges, peer dependencies and anything
   already newer are left alone and listed in the pull request;
3. reinstalls and runs `genesis doctor`. With pnpm it then does what `genesis upgrade` does, with
   the same embedded code (`normaliseReleaseAgeExcludes` in bump-core.mjs): the entries pnpm
   pinned in pnpm-workspace.yaml's `minimumReleaseAgeExclude` become one entry per Genesis package
   listing its exact versions (`'@marktiderman/genesis-features@0.8.0 || 0.8.1'`), which app-ci's
   `pnpm install --frozen-lockfile` honours on pnpm 11.1.3, versions the lockfile no longer holds
   are dropped, 1.17.3's `'@marktiderman/genesis-*'` and bare `'@marktiderman/genesis'` become
   exact versions, other entries (an app's own pattern included) are left as they are (exact
   versions need pnpm 10.19 or later; the run warns on an older one), and
   `pnpm dedupe` runs (`npm dedupe` with npm). Never a pattern: `'@marktiderman/genesis-*'` would
   let every future Genesis release skip `minimumReleaseAge`. With `minimumReleaseAge` set in the
   app, pnpm's strict mode fails the install with `ERR_PNPM_NO_MATURE_MATCHING_VERSION` instead;
   the run fails and says so, and never loosens the setting: add the new versions to
   `minimumReleaseAgeExclude` (exact versions), or run again once they are old enough;
4. commits the package.json files, the lockfile and, when pnpm or the tidy changed it,
   pnpm-workspace.yaml to `branch` (default `genesis-upgrade/<base-branch>`), rebuilt from
   `base-branch`, and opens or updates one pull request into `base-branch`. When nothing changed since the last run the branch
   is left as it is. Once anyone else pushes to the branch (say, a fix for a doctor finding), runs
   leave it alone and say so, until its pull request is merged or closed and the branch deleted.

`base-branch` (default: the repository's default branch) is where each run starts and what its
pull request targets, whichever branch the schedule or dispatch ran on; a repository that batches
changes through a staging branch sets it to that branch. Both jobs build on the one commit of it
the run resolved first.

To upgrade two folders (say `app/` and `mobile/`), call the workflow once per folder in the same
caller. The doctor's output is handed between jobs as one artifact per folder
(`genesis-upgrade-doctor-<working-directory>`, `/` as `-`, `.` as `root`), so the calls don't
collide. Give each call its own `branch`, or both push the same default branch.

The bump is the same code `genesis upgrade` runs (`packages/genesis-cli/src/upgrade/bump-core.mjs`,
embedded in the workflow by `scripts/sync-genesis-bump.mjs`). The workflow doesn't call `genesis
upgrade` itself: its pull request job runs no dependency code, and the CLI is one. So the workflow
moves versions only; run `genesis upgrade` on its branch to also refresh the templates, functions
and skills Genesis owns in the app (see the CLI's README).

A doctor failure is written into the pull request and fails the run. `dry-run: true` does steps
1 to 3, writes the run summary and pushes nothing. The secret `npm-token` works as in app-ci.

The job that holds the write token runs no dependency code. A read-only job bumps, installs
(install scripts run there) and runs the doctor. The pull request job then makes the same bump
again from the same release, writes the lockfile with install scripts off
(`--lockfile-only`/`--package-lock-only --ignore-scripts`), and commits only those files; the only
thing it takes from the first job is the doctor's output, shown escaped in the pull request. Review
the lockfile change as you would any dependency update. Install scripts off doesn't stop a `.pnpmfile.cjs` or pnpm config
dependencies, so the pull request job checks out with `persist-credentials: false`: the write
token isn't in `.git/config` while pnpm runs, and only the last step has it, for git's fetch and
push (an auth header in git's environment) and `gh`.

The caller grants `contents: write` and `pull-requests: write`. With the default `GITHUB_TOKEN`:

- the repository must allow GitHub Actions to create pull requests (Settings, Actions, General,
  "Allow GitHub Actions to create and approve pull requests");
- a pull request it opens doesn't start other workflows, so CI won't run on it until someone
  pushes. Pass a `token` secret (a fine-grained token or a GitHub App token with contents and pull
  requests write) to have CI run on it.

## Previews

Genesis's standard: **production builds on every merge to `main`; previews are built on demand**,
not on every pull request. A pull request still gets every check (app-ci, supabase-ci's fresh
database and pgTAP tests); what it doesn't get by default is a deployed copy.

| Setting | Default | Values |
|---|---|---|
| previews | `on-demand` | `on-demand`, `every-pr`, `off` |
| trigger | label `preview`, or a branch starting `preview/` | (web also takes `[preview]` in the commit message) |

Today these are environment variables on each platform (below). **Planned**
([`app-environments`](../features.ts)): a `genesis.config.json` `environments` block and a
`genesis previews should-build` command that read the same names and defaults, so moving them into
config changes no behaviour. Neither exists yet.

### Web: Vercel

[`templates/vercel/ignore-build.sh`](../templates/vercel/ignore-build.sh) is Vercel's "Ignored
Build Step" (exit 0 skips, exit 1 builds). Production (`VERCEL_ENV=production`) always builds. A
preview builds only for a `preview/…` branch, a commit whose message has `[preview]`, or a pull
request labelled `preview` (any case; before Vercel has the pull request's number, a label on any
open pull request for the branch counts); everything else is skipped. Two cases always build,
because production must never be skipped: a deploy without `VERCEL_ENV` (system variables not
exposed, so production can't be told from a preview) and a custom environment
(`VERCEL_TARGET_ENV` other than `preview`, such as `staging`).

1. Copy it to `scripts/vercel-ignore-build.sh` in the app, and replace `GENESIS_SHA` in its header
   with the commit of the Genesis release you copied it from (as in [Which ref to
   call](#which-ref-to-call)); upgrade it the same way as the CI templates.
2. Add `"ignoreCommand": "bash scripts/vercel-ignore-build.sh"` to the app's `vercel.json`
   ([`templates/vercel/vercel.json`](../templates/vercel/vercel.json)). The path is relative to the
   Vercel project's Root Directory. `ignoreCommand`
   [overrides](https://vercel.com/docs/project-configuration/vercel-json#ignorecommand) the
   dashboard's **Settings → Git → Ignored Build Step**, so leave that one at its default.
3. In the Vercel project, **Settings → Environment Variables**: keep **Automatically expose System
   Environment Variables** on (the script reads `VERCEL_ENV` and `VERCEL_GIT_*`; with it off,
   every deploy builds), and add, for the
   **Preview** environment only:

   | Variable | Default | |
   |---|---|---|
   | `GENESIS_PREVIEW_GITHUB_TOKEN` | none | A fine-grained GitHub token with read-only **Pull requests** access to this repository. Without it the label isn't checked (branch and commit opt-ins still work). |
   | `GENESIS_PREVIEWS` | `on-demand` | `every-pr` builds every preview; `off` builds none. Production builds either way. |
   | `GENESIS_PREVIEW_LABEL` | `preview` | Set but empty turns the label check off. |
   | `GENESIS_PREVIEW_BRANCH_PREFIX` | `preview/` | Set but empty turns the branch check off. |

The label check fails closed: no token, a failed or rate-limited request, a non-GitHub repository
or an answer it can't read skips the build. Vercel doesn't redeploy when a label is added, so
after labelling push a commit or redeploy the latest one. A preview uses the Supabase variables of
Vercel's Preview environment; point them at a Supabase preview branch only when the change needs
its own database.

### Database: Supabase

Turn off Supabase's automatic branching, keep supabase-ci as the per-pull-request database check,
and create preview branches only when a change needs one.

1. **Supabase dashboard → Project Settings → Integrations → GitHub Integration**: turn
   **Automatic branching** off (it's the option that "automatically sync[s] GitHub branches with
   Supabase branches"; [GitHub
   integration](https://supabase.com/docs/guides/deployment/branching/github-integration)). Keep
   the GitHub connection itself: an on-demand branch can still be linked to a git branch.
2. Keep [`supabase-ci.yml`](#supabase-ci) (template
   [`templates/ci/supabase-ci.yml`](../templates/ci/supabase-ci.yml)) on every pull request. It
   builds a fresh database from every migration and runs the pgTAP tests, which is what a branch
   was mostly being used to prove.
3. When a change needs a hosted database: `supabase branches create <name>` (or, with the
   **Branching via dashboard** feature preview on, the branch menu beside the project name →
   **Create branch**). Delete it when the pull request is done (`supabase branches delete`); a
   branch is billed while it runs.

**Why automatic branching fails with a custom exposed schema.** Supabase's
[branching workflow](https://supabase.com/docs/guides/deployment/branching) runs Clone, Pull,
Health, **Configure** ("Updates service configurations based on your config.toml file"), then
**Migrate** ("Applies pending database migrations"). Configure applies `[api]`
([troubleshooting](https://supabase.com/docs/guides/deployment/branching/troubleshooting): it
"applies only the `[db]`, `[api]`, `[auth]`, `[storage]`, and `[experimental]` sections"), so the
branch's Data API is pointed at every schema in `[api] schemas` before any migration has created
it. A schema that only a migration creates (`create schema api;`) doesn't exist yet, PostgREST
can't load it, and the branch's health check fails. Supabase's docs don't describe exposed custom
schemas on branches at all; the step order above is what they do document, and the failure is
what Genesis apps saw. An on-demand branch runs the same steps, so if its Data API is unhealthy
after Migrate finishes, check it serves the schema before relying on it.

`genesis doctor`'s supabase pack warns about this:
[`exposed-schema-created-later`](../packages/genesis-cli/README.md) flags each schema in
`[api] schemas` (or `exposedSchemas`) that only a migration creates, or that none does. Once
automatic branching is off, record that in `genesis.config.json`:
`"doctor": { "supabase": { "automaticBranching": false } }` (not an `allow` entry, which a doctor
run with `--base` fails as `allow-grew`). The rule is a warning, so an app that runs the doctor with
`doctor-strict: true` fails until it does.

### Native: EAS

[`templates/eas/workflows/pr-preview.yml`](../templates/eas/workflows/pr-preview.yml) is the native
equivalent: an installable build and an update channel per pull request, started by the `Preview`
label or by a pull request into `main` that changes the app's code or build config
([NATIVE-RELEASE.md](./NATIVE-RELEASE.md)). GitHub keeps one label per name whatever its case, so
one `preview` label serves both; name it in `pull_request_labeled.labels` as GitHub shows it.

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
- The upgrade only updates a pull request from its own repository, never a fork's branch of the
  same name, and never pushes to the base or default branch.
- Concurrency groups: a newer push to a pull request cancels the older run; branch pushes group by
  commit, so they never cancel each other; two upgrade runs never push the same branch at once.
  Two calls of app-ci in one caller with the same folder, package manager and Node version share a
  group, so give them different inputs or separate workflows.

## Testing these workflows

[`ci-templates-self-test.yml`](../.github/workflows/ci-templates-self-test.yml) calls `app-ci` (with
pnpm, Bun and npm) and `supabase-ci` against the fixture app in
[`.github/ci-fixture`](../.github/ci-fixture) on every pull request that changes them. The
fixture installs the published Genesis packages and leaves out genesis-ui's React peers, which the
doctor doesn't need. `genesis-upgrade` isn't in the self-test, because its pull request job needs a
write token: try a change to it from a scratch repository with `dry-run: true` first.

Validate edits locally with `actionlint .github/workflows/*.yml templates/ci/*.yml`.

`templates/vercel/ignore-build.sh` is tested by
[`scripts/__tests__/vercel-ignore-build.test.mjs`](../scripts/__tests__/vercel-ignore-build.test.mjs)
(part of `pnpm test`), which runs it against every decision with a stub `curl` in place of GitHub.
