# Native release

How a Genesis native app goes from a pull request to the stores: EAS Workflows for previews,
builds, store submissions and an over-the-air update on every merge to `main`, and Maestro smoke
flows. The starter (`apps/genesis-rn-starter`) ships all of it; the canonical copies are in
[`templates/eas/`](../templates/eas) and [`templates/maestro/`](../templates/maestro).

| File | What it does |
| --- | --- |
| `eas.json` | Build profiles `development` (a release build of the development variant, not a dev client: the starter has no `expo-dev-client`), `preview`, `e2e` (a development simulator build) and `production`, each with its `APP_VARIANT`, EAS environment and channel; app versions from EAS (`appVersionSource: remote`); store submission with placeholder ids. |
| `.eas/workflows/pr-preview.yml` | A pull request into `main` that changes the app, or one labeled `Preview` ([Build cost](#build-cost)): fingerprint, then repack a preview build with the same fingerprint (or build one when native code changed), publish an update to the channel `pr-<number>`, and comment the install link and QR code. iOS only once `PREVIEW_IOS=true`. |
| `.eas/workflows/deploy-production.yml` | Every merge to `main`: per platform, a new store build (submitted in the same run) only when the native fingerprint changed, otherwise an over-the-air update to every `production` install. |
| `.eas/workflows/rollout.yml` | By hand: promote an update you staged by hand (after a failed-launch check) or roll it back. |
| `.eas/workflows/e2e.yml` | By hand (Maestro needs a paid EAS plan): the Maestro flows on an iOS simulator build (repacked when the fingerprint matches). The `account` flow is left out until its secrets exist. |
| `.eas/scripts/rollout-health.mjs` | The check `rollout.yml` runs before promoting. |
| `.maestro/` | Smoke flows: launch, the sign-in screen, Settings' version row (after signing in). |

## A phone app beside a web app

A phone app often uses the web app's Supabase project rather than one of its own: the same
logins, the same tables, one migrations folder (the web app's `supabase/`). Make it with
`genesis init <app> --template native --beside <web-app>` (see the
[genesis-cli README](../packages/genesis-cli/README.md#a-phone-app-beside-a-web-app)):

- The phone app has no `supabase/` folder and no database workflow
  (`.github/workflows/database.yml`); its `genesis.config.json` says
  `"supabase": { "app": "../app" }`.
- Its `.env` holds the web app's project URL and publishable key; EAS environments hold the same
  values for each profile.
- Database changes ship from the web app: its migrations, pgTAP tests and Edge Functions, its
  `supabase db push`, its database CI. The phone app's blocks (push, notifications, support,
  chat, app updates) need their database side there: init prints the `genesis add` line to run,
  and `genesis migrate` in the phone app prints it again for any block the web app's lock
  doesn't list.
- `genesis add`, `migrate` and `upgrade` in the phone app never write Supabase files. Run them in
  the web app for the database, and in the phone app for its own files (templates, skills, route
  stubs).
- A release of the phone app that needs a new migration waits for the web app's release that
  applies it: an over-the-air update must not reach phones before the tables it reads exist.

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

   `preview` also takes `PREVIEW_IOS=true` (a plain variable) once an iOS device is registered;
   see [Build cost](#build-cost).
4. **Preview paths.** `genesis init --template native` fills in the app's code folder in
   `pr-preview.yml` (`src`). In a copy made by hand, replace `REPLACE_WITH_APP_FOLDER` with it
   (`src`, or `apps/<name>` in a monorepo; an app with code in other top-level folders, such as
   `app/` and `components/`, lists each). `genesis doctor` warns about any `REPLACE_WITH_…` left in
   `eas.json` or `.eas/workflows/` (rule `eas-placeholder`).
5. **Store credentials.** Replace the App Store Connect app id and Apple team id in `eas.json`
   `submit.production.ios`, and set up signing (`eas credentials`). For Google Play, the submit
   runs on EAS, where a local key file isn't there: create a Google Cloud service account and its
   JSON key, invite it in Play Console → Users and permissions, upload the key with `eas
   credentials` (Android → Google Service Account), and remove only the `serviceAccountKeyPath`
   line ([Expo's guide](https://docs.expo.dev/submit/android/)). Until you ship to Google Play,
   remove the `submit_android` job from `deploy-production.yml` instead and leave
   `submit.production.android` as it is. A placeholder left in fails the submit job; it can't
   submit somewhere else.
6. **Release policy.** Apply `supabase/migrations` (the `app_release_policy` table the updates
   block reads; see the [updates block](../packages/native/README.md#updates-force-upgrade-maintenance-update-banner-whats-new)).

## The release path

1. **Pull request.** `pr-preview.yml` comments a build to install. A preview build already on a
   phone can take the pull request's update instead: `useUpdates().channels.switchTo("pr-42")`
   (the starter turns channel switching on only in the development and preview variants, by their
   bundle id suffix, so a production build never can; it has no screen for it yet). Run `e2e.yml`
   by hand for the Maestro flows (`eas workflow:run e2e.yml --ref <branch>`).
2. **Merge into `main`.** That merge is the release: `main` takes pull requests only, from the
   people allowed to merge into it, so nothing waits for a second approval. A merge that changes
   native code is a new store version once it's released: bump `version` in `app.config.ts` in
   the same change when you mean to release it. The version isn't part of the fingerprint, so a
   bump on its own starts no build, and a native change without one uploads the old version
   string, which App Store Connect refuses once that version is released (and the updates block's
   minimum versions compare it).
3. **deploy-production.yml** fingerprints the commit. Per platform:
   - native code changed (no production build with this fingerprint): a store build, submitted in
     the same run to TestFlight and to Google Play's internal track as a draft. Releasing it to
     the stores is still your step in App Store Connect and Play Console.
   - JavaScript only: an update to the `production` channel for every install on that runtime
     version, one update group per platform.

   Each platform runs on its own: a failed Android build doesn't hold back the iOS update.

   A production build whose submit failed still matches its fingerprint, so the next
   JavaScript-only merge sends an update to a binary nobody installed. Submit that build by hand
   (`eas submit --platform ios --id <build id> --profile production`).
4. **To take an update back**, republish the update group before it:
   `eas update:republish --group <id>` (the ids are in `eas update:list --branch production`).

   Updates go to every install, not a staged share: EAS refuses to start a second rollout on the
   same channel, platform and runtime version while one is in progress, so a staged update would
   make the next merge's update fail. To stage one anyway, publish it by hand with
   `--rollout-percentage` and finish it with **rollout.yml** before the next merge:

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
- **Production starts from git.** `deploy-production.yml` runs only on a push to `main`, so it
  builds a commit, never a folder. Run `rollout.yml` with `--ref`: `eas workflow:run` without
  it uploads the working directory as it is, and nothing in the workflow can tell.
- **The merge into `main` is the approval.** Protect `main` (pull requests only, required checks,
  and only the people who may release can merge). Store builds go to TestFlight and a Play draft,
  never straight to release; each is submitted in the run that built it, so an update never goes
  to a build nobody has.
- **One update at a time, to everyone.** Production updates go to every install; take one back by
  republishing the update before it. A staged update blocks the next merge's update until it's
  promoted or rolled back.
- **No secrets in the files.** Tokens and test passwords are EAS environment secrets; the
  workflows pass inputs to shell steps only through `env`. The test fails on a secret-looking `env`
  key or a token in a workflow file.

## Build cost

Every workflow run that builds or repacks uses EAS build minutes, and a pull request gets a new
run on each push. The templates start narrow; widen them in the app's copy when the plan allows.

| Workflow | Runs by default | Why | To widen it |
| --- | --- | --- | --- |
| `pr-preview.yml` | Pull requests into `main` whose changes touch the app's code folder, `app.json`, `app.config.*`, `eas.json`, `package.json` or a lockfile (pnpm, yarn, npm, bun); and any pull request labeled `Preview`. Android only. One run per branch at a time. | A docs-only or tooling-only pull request has nothing to install, and every push would otherwise repack (or build) both platforms. An iOS preview is an ad hoc build, which installs only on devices registered before it was built: with none, every iOS job fails. | Add branches or paths under `on.pull_request`, or delete both to run on every pull request. Turn iOS on with `PREVIEW_IOS=true` in the `preview` EAS environment after `eas device:create`. |
| `e2e.yml` | Only by hand: `eas workflow:run e2e.yml --ref <branch>`. | Maestro jobs need a paid EAS plan, and each run is a simulator build or repack. | Once the plan includes Maestro, add the `pull_request` trigger in the file's header comment (into `main`, the app's paths and `.maestro/**`). |
| `deploy-production.yml` | Every push to `main`. | A store build only when the native fingerprint changed. | Not needed. |
| `rollout.yml` | Only by hand. | No build. | Not needed. |

`pull_request_labeled` takes no `paths` in EAS's syntax, so adding the `Preview` label starts one
run whatever the pull request changes. It fires when the label is added, not on later pushes: those
still need a matching path, or remove and add the label again. Labeling a pull request that already
matches the paths can start a second run; `pr-preview.yml`'s `concurrency`
(`${{ workflow.filename }}-${{ github.ref }}`, `cancel_in_progress: true`) keeps one run per
branch, so the newer cancels the older, and a new push cancels a run it supersedes. A cancelled run
can still have spent some build minutes.

**What is verified, and what isn't.** The templates validate against EAS's public workflow schema,
and the triggers, `concurrency` and the iOS gate follow docs.expo.dev/eas/workflows/syntax. None of
it has been checked on a live EAS run yet. In particular:

- The iOS gate (`if: ${{ env.PREVIEW_IOS == 'true' … }}` on `get_ios_build`, `repack_ios` and
  `build_ios`, each with `environment: preview`) assumes the job's `env` context carries the
  preview EAS environment's variables. The docs say `env` is available to a job's `if` once its
  environment is resolved, but don't say outright that environment variables are in it. If they
  aren't, the gate reads unset and iOS stays off (it never turns on by mistake). Check the first
  run after setting `PREVIEW_IOS=true` builds iOS.
- The fingerprint job hashes both platforms in one job and isn't gated; it builds nothing.
- The docs describe `github.event.pull_request` for `pull_request` events and don't say it's set
  for `pull_request_labeled`. The update channel (`pr-<number>`) and the comment read it; check
  the first labeled run's channel name.
- That `github.ref` is the same for both triggers of one pull request, which the `concurrency`
  group relies on to fold the two runs into one.

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
owns its copies. An app made with `genesis init --template native` records them in
`genesis.lock.json`, and `genesis upgrade` refreshes them from the installed CLI's templates: a copy
you haven't changed takes the new version, one you changed is merged three ways or left with the
new text beside it (`.genesis-next`). An app copied by hand has no lock entries, so diff its copies
against `templates/` when you upgrade. The `genesis-upgrade` workflow ([APP-CI.md](./APP-CI.md))
moves package versions only.

## Validating the workflows

`eas workflow:validate <file>` checks a file against EAS's schema and then on EAS's servers, so it
needs a login and a project id. Offline, the same schema checks (job types, structure, build
profiles in `eas.json`) can be run with eas-cli's own validator against the public schema
(`https://api.expo.dev/v2/workflows/schema`); that is how these templates were checked. The
server-side step wasn't run.
