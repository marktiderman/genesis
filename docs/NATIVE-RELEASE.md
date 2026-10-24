# Native release

How a Genesis native app goes from a pull request to the stores: EAS Workflows for previews,
builds, store submissions and staged over-the-air updates, and Maestro smoke flows. The starter
(`apps/genesis-rn-starter`) ships all of it; the canonical copies are in
[`templates/eas/`](../templates/eas) and [`templates/maestro/`](../templates/maestro).

| File | What it does |
| --- | --- |
| `eas.json` | Build profiles `development` (a release build of the development variant, not a dev client: the starter has no `expo-dev-client`), `preview`, `e2e` (a development simulator build) and `production`, each with its `APP_VARIANT`, EAS environment and channel; app versions from EAS (`appVersionSource: remote`); store submission with placeholder ids. |
| `.eas/workflows/pr-preview.yml` | Each pull request: fingerprint, then repack a preview build with the same fingerprint (or build one when native code changed), publish an update to the channel `pr-<number>`, and comment the install link and QR code. |
| `.eas/workflows/deploy-production.yml` | A pushed `v*.*.*` tag: per platform, a new store build only when the native fingerprint changed, otherwise an over-the-air update to `production` at 10%. Both wait for a person's approval. |
| `.eas/workflows/rollout.yml` | By hand: promote the staged update (after a failed-launch check) or roll it back. |
| `.eas/workflows/e2e.yml` | Each pull request: the Maestro flows on an iOS simulator build (repacked when the fingerprint matches). The `account` flow is left out until its secrets exist. |
| `.eas/scripts/rollout-health.mjs` | The check `rollout.yml` runs before promoting. |
| `.maestro/` | Smoke flows: launch, the sign-in screen, Settings' version row (after signing in). |

## One-time setup

Nothing in the templates names a real account. Before the first run:

1. **EAS project.** `eas init`, then put the project id it prints in `starter.config.ts`
   (`app.easProjectId`). That sets the update URL (`https://u.expo.dev/<id>`) and
   `extra.eas.projectId`. Until then builds have `updates.enabled: false` and no workflow can run.
2. **GitHub.** Connect the repository to the EAS project (expo.dev, project settings, GitHub). In a
   monorepo, set the base directory to the app's folder, where `.eas/` and `eas.json` are. EAS reads
   the workflow files from the connected repository.
3. **EAS environments** (`eas env:create`, or expo.dev):

   | Environment | Variables |
   | --- | --- |
   | `development`, `preview`, `production` | `APP_VARIANT` (the environment's name), `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` |
   | `production` | `EXPO_TOKEN` (secret): a robot token with access to the project, for `rollout.yml`'s EAS CLI steps |
   | `development` | `MAESTRO_TEST_EMAIL`, `MAESTRO_TEST_PASSWORD` (secret): a test account on that Supabase project, for the `account` flows |

   The workflows also set `APP_VARIANT` on every job that evaluates the config, and `eas.json` sets
   it per build profile, but `eas update` and fingerprints run from your laptop read only the EAS
   environment ([Setting APP_VARIANT](../packages/genesis-cli/README.md#setting-app_variant)).
4. **Store credentials.** Replace every `REPLACE_WITH_…` in `eas.json` `submit.production`
   (App Store Connect app id, Apple team id, the path of the Google service account key) and set up
   signing (`eas credentials`). A placeholder left in fails the submit job; it can't submit
   somewhere else.
5. **Release policy.** Apply `supabase/migrations` (the `app_release_policy` table the updates
   block reads; see the [updates block](../packages/native/README.md#updates-force-upgrade-maintenance-update-banner-whats-new)).

## The release path

1. **Pull request.** `pr-preview.yml` comments a build to install. A preview build already on a
   phone can take the pull request's update instead: `useUpdates().channels.switchTo("pr-42")`
   (the starter turns channel switching on only in the development and preview variants, by their
   bundle id suffix, so a production build never can; it has no screen for it yet). `e2e.yml` runs the Maestro flows.
2. **Merge**, then tag the release: `git tag v1.4.0 && git push origin v1.4.0`. A release that
   changes native code is a new store version: bump `version` in `app.config.ts` in the same
   change. The version isn't part of the fingerprint, so a bump on its own starts no build, and a
   native change without one uploads the old version string, which App Store Connect refuses once
   that version is released (and the updates block's minimum versions compare it).
3. **deploy-production.yml** fingerprints the commit. Per platform:
   - native code changed (no production build with this fingerprint): a store build. After
     approval it goes to TestFlight and to Google Play's internal track as a draft. Releasing it
     to the stores is still your step in App Store Connect and Play Console.
   - JavaScript only: after approval, an update to the `production` channel for 10% of installs
     on that runtime version, one update group per platform.

   The approval isn't offered when a build failed, so one approval never ships half a release.
   Before approving, check that the tag's commit is on `main`.

   A production build whose approval was rejected, or whose submit failed, still matches its
   fingerprint, so the next JavaScript-only tag sends an update to a binary nobody installed.
   Submit that build by hand (`eas submit --platform ios --id <build id> --profile production`).
4. **rollout.yml** raises the rollout (25, 50, 100) or rolls it back, once per platform's update
   group:

   ```bash
   eas workflow:run rollout.yml --ref main --input update_group_id=<id> --input action=promote --input percentage=50
   eas workflow:run rollout.yml --ref main --input update_group_id=<id> --input action=rollback
   ```

### What the rollout check sees, and what it can't

Before promoting, `rollout.yml` reads `eas update:insights <group> --json` and stops when the
group has fewer than 200 launches or more than 1% failed launches. The limits are written in the
workflow, not inputs, so a run can't turn the check off; change them in the file, by pull request.

Rollback (`eas update:revert-update-rollout`) works while the update is staged. Once it is at
100% the rollout is over and the revert fails: republish the group before it instead
(`eas update:republish --group <id>`).

EAS's "crash rate" for an update is **failed launches**: expo-updates couldn't start the update and
fell back to the code before it. It is not crash-free sessions; a crash after the app started
isn't counted. EAS has no crash-free-session figure for an update, so the workflow can't gate on
it. The manual step, before every promotion: open your crash reporter's release health for the
update (the update id is in the version signature, Settings > About, and in `eas update:list`)
and compare crash-free sessions with the update before it. Promote only if it is no worse.

## Safety

- **Nothing reaches production from a pull request.** `pr-preview.yml` and `e2e.yml` use the
  preview and development profiles, environments and channels, and have no submit, rollout or
  custom job. A test in the starter (`__tests__/release.test.ts`) fails if one of them names
  production or runs `eas update`/`eas submit`. EAS doesn't run `pull_request` workflows for
  pull requests from forks, so those environments' secrets stay with your own branches.
- **Production starts from git.** `deploy-production.yml` runs only on a pushed `v*.*.*` tag, so
  it builds a commit, never a folder. Run `rollout.yml` with `--ref`: `eas workflow:run` without
  it uploads the working directory as it is, and nothing in the workflow can tell.
- **A person approves.** Every submit job and every production update `needs` a
  `require-approval` job (the starter's test fails otherwise; `after` wouldn't do, since it also
  runs after a rejection). Store builds go to TestFlight and a
  Play draft, never straight to release.
- **Staged, one at a time.** Production updates start at 10%. EAS refuses to start a second
  rollout on the same channel, platform and runtime version while one is in progress, so finish or
  roll back the first.
- **No secrets in the files.** Tokens and test passwords are EAS environment secrets; the
  workflows pass inputs to shell steps only through `env`. The test fails on a secret-looking `env`
  key or a token in a workflow file.

## Fingerprints

The runtime version is the native fingerprint (`withGenesis` sets `runtimeVersion: { policy:
"fingerprint" }`), so an update reaches exactly the builds whose native code matches it, and
`deploy-production.yml` uses the same fingerprint to choose between a build and an update.

`app.config.ts` imports `starter.config.ts`; the fingerprint would hash it as a file, so turning
off a JavaScript-only feature would give a new runtime version and strand installed builds.
`.fingerprintignore` leaves it out, and the starter's test checks that `app.config.ts` imports
nothing else and reads no JavaScript-only switch. Measured with `@expo/fingerprint` on the
starter:

| Change | iOS / Android fingerprint |
| --- | --- |
| `updates: false` | unchanged |
| `queryPersistence: false` | unchanged |
| `appleSignIn: false` | changed (`usesAppleSignIn` is native) |
| `version` in app.config.ts | unchanged (the fingerprint leaves the version out) |
| `.eas/`, `eas.json`, `.maestro/` | not hashed |
| a `package.json` script, `APP_VARIANT`, `app.easProjectId` | changed |

## Maestro

The flows run against the development variant (`com.example.genesisstarter.dev`; `e2e` builds it
for the simulator). Locally:

```bash
APP_VARIANT=development pnpm --filter genesis-rn-starter ios --configuration Release
MAESTRO_TEST_EMAIL=… MAESTRO_TEST_PASSWORD=… pnpm --filter genesis-rn-starter e2e
```

`settings-version.yaml` signs in, so it needs an account on the Supabase project the build points
at; the others don't. Skip it with `maestro test --exclude-tags account .maestro/flows`.

## Templates

`templates/eas/` and `templates/maestro/` are the canonical copies. The starter's copies must be
identical (`__tests__/release.test.ts`), so a change is made in both. An app made from the starter
owns its copies; refreshing them from a newer Genesis is the job of `genesis upgrade` (the
`cli-add` feature, not built yet). Until it is, diff them against `templates/` by hand when you
upgrade. The `genesis-upgrade` workflow ([APP-CI.md](./APP-CI.md)) moves package versions only.

## Validating the workflows

`eas workflow:validate <file>` checks a file against EAS's schema and then on EAS's servers, so it
needs a login and a project id. Offline, the same schema checks (job types, structure, build
profiles in `eas.json`) can be run with eas-cli's own validator against the public schema
(`https://api.expo.dev/v2/workflows/schema`); that is how these templates were checked. The
server-side step wasn't run.
