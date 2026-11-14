# Native release

How a Genesis native app goes from a pull request to phones: previews on EAS for pull requests, a
release lane on every merge to `main` (an over-the-air update from GitHub Actions in minutes, or a
store build on EAS when native code changed), Maestro smoke flows, and a manual rollout. Every
Genesis app gets the files from Genesis, versioned with `@marktiderman/genesis-cli`, and changes
them in its own `genesis.config.json`, not by editing them.

| File (in the app) | Template | What it does |
| --- | --- | --- |
| `.github/workflows/native-release.yml` | `templates/ci/native-release.yml` | Every push to `main` that changes the app: per platform, an over-the-air update published here, or the commit handed to EAS ([The release path](#the-release-path)). |
| `.eas/workflows/deploy-production.yml` | `templates/eas/workflows/deploy-production.yml` | Only when started (by `native-release.yml`): per platform, a store build submitted in the same run, or an update on a build that is still being made. |
| `.eas/scripts/native-release.mjs` | `templates/eas/scripts/native-release.mjs` | The lane's decisions (plan, masks, the build profile's env, the runtime checks), kept out of the YAML so they are tested. |
| `fingerprint.config.js`, `.fingerprintignore` | `templates/expo/` | What the runtime version hashes ([Fingerprints](#fingerprints)). |
| `.eas/workflows/pr-preview.yml` | `templates/eas/workflows/pr-preview.yml` | A pull request into `main` that changes the app, or one labeled `Preview` ([Build cost](#build-cost)): repack a preview build with the same fingerprint (or build one), publish to the channel `pr-<number>`, comment the install link. iOS only once `PREVIEW_IOS=true`. |
| `.eas/workflows/rollout.yml`, `.eas/scripts/rollout-health.mjs` | `templates/eas/` | By hand: promote an update you staged by hand (after a failed-launch check), or roll it back. |
| `.eas/workflows/e2e.yml`, `.maestro/` | `templates/eas/`, `templates/maestro/` | By hand (Maestro needs a paid EAS plan): the Maestro flows on an iOS simulator build. |
| `eas.json` | `templates/eas/eas.json` | Build profiles `development`, `preview`, `e2e` and `production`, each with its `APP_VARIANT`, EAS environment and channel; store submission with placeholder ids. |

`genesis init --template native` writes them all. An existing app adopts them with
`genesis add template release` ([Adopting the lane](#adopting-the-lane)); `genesis upgrade` keeps
them current ([Upgrading and customising](#upgrading-and-customising)).

## The release path

1. **Pull request.** `pr-preview.yml` comments a build to install. A preview build already on a
   phone can take the pull request's update instead: `useUpdates().channels.switchTo("pr-42")`
   (the starter turns channel switching on only in the development and preview variants). Run
   `e2e.yml` by hand for the Maestro flows (`eas workflow:run e2e.yml --ref <branch>`).
2. **Merge into `main`.** That merge is the release: `main` takes pull requests only, from the
   people allowed to merge into it. A merge that changes native code is a new store version once
   it's released: bump `version` in `app.config.ts` in the same change when you mean to release it
   (the version isn't part of the fingerprint, so a bump alone starts no build).
3. **`native-release.yml`** (GitHub Actions; a runner starts in seconds, where an EAS job can queue
   for most of an hour) runs on the push. Per platform it finds the commit's runtime version (Expo's
   fingerprint as the production build profile computes it, or your command: [The release
   block](#the-release-block)) and the finished production store builds that have it, lists the
   open runs of `deploy-production.yml`, and reads the channel's latest update:
   - **The channel's latest update already carries this commit or a later one** (GitHub ran a later
     commit's release first, or this is a re-run): nothing is published or built for that platform,
     and the run says so (a warning and a line in the job summary), so an older commit never
     overwrites a newer one.
   - **A finished build has it, and no EAS release run is open** (most merges: JavaScript only):
     with the build profile's `env` for that platform (eas.json, `<platform>.env` over the common
     one, along `extends`, as the build had it; `eas update` doesn't apply it by itself), it checks
     this checkout's runtime version (`expo-updates runtimeversion:resolve`) is the build's, then
     publishes the update to the `production` channel for that platform, checks the update went to
     that runtime version, then uploads the source maps to Sentry and runs your release hook, when
     those are on.
   - **Otherwise** (native code changed, or the build with this runtime version is still being
     made, or an EAS release run is open): nothing is published here for that platform. The job
     starts `deploy-production.yml` on EAS for that commit and those platforms
     (`eas workflow:run --ref <commit> -F commit_sha=<commit> -F ios=true -F ios_runtime_version=<…> -F android=false …`).
     `ios` and `android` are choices compared as text (`inputs.ios == 'true'`): `-F` sends every
     value as a string, so a boolean `false` would read as true. The runtime versions are the ones
     computed here, with the build profile's env, so EAS matches builds on the same value.

   Each platform of each commit takes exactly one of the two paths, so an update is never published
   twice. A failure on one platform doesn't hold the other back: the Android update still publishes
   after a failed iOS one, and EAS still gets what it should. A failed shared check (the plan, the
   Sentry token) stops every platform's publish.
4. **`deploy-production.yml`** (EAS, only when started), per platform it was given:
   - a build with the runtime version, finished or still being made (`get-build` waits for one in
     progress): publish this commit as an update on it, with the same steps as GitHub (the
     platform's profile env, the runtime version checked before and after; it runs `eas-cli` with
     `EXPO_TOKEN` from the EAS environment);
   - none (native code changed): build, then submit to TestFlight and Google Play's internal track
     as a draft. Releasing to the stores stays your step in App Store Connect and Play Console.
5. **To take an update back**, republish the update group before it:
   `eas update:republish --group <id>` (`eas update:list --branch production`). With no earlier
   update on that platform and runtime version:
   `eas update:roll-back-to-embedded --channel production --platform <ios|android> --runtime-version <version>`.
   Updates go to every install, not a staged share: EAS refuses a second rollout on the same
   channel, platform and runtime version while one is in progress, so a staged update would make
   the next merge's update fail. To stage one anyway, publish it by hand with
   `--rollout-percentage` and finish it with `rollout.yml` before the next merge:

   ```bash
   eas workflow:run rollout.yml --ref main --input update_group_id=<id> --input action=promote --input percentage=50
   eas workflow:run rollout.yml --ref main --input update_group_id=<id> --input action=rollback
   ```

Skip a push with `[eas skip]` in its commit message. Run the release by hand from Actions ("Native
release", Run workflow, on `main`): it releases `main` as it is, and starts the EAS half when it
must, with the runtime versions it needs.

**Order.** GitHub publishes within minutes, an EAS run perhaps an hour later. So while any run of
`deploy-production.yml` is open (new, in progress, waiting or awaiting approval), every later
commit goes to EAS too, for every platform, instead of publishing an update the older EAS run would
then overwrite. On EAS, runs are serialized (`concurrency`, never cancelling one in progress): each
finishes before the next starts, in the order GitHub started them, which is the order the commits
reached `main` (GitHub's runs are serialized too). EAS drops waiting runs in between; the newest one
carries their code, on every platform. GitHub doesn't promise to start runs in push order, so before
publishing or handing a platform to EAS, each run checks the channel's latest update (the newest
group in `eas update:list --branch <channel>`, then its commit from `eas update:view <group>`;
none before the first release, when the branch doesn't exist yet): when it already carries this
commit or a later one (`git merge-base --is-ancestor`), the run skips that platform out loud. It never skips because a later commit is expected to ship, which could drop a release
silently. Left over:
- Two EAS runs started out of order (GitHub ran the later commit's release first, while an EAS run
  was open) publish in the order they were started; the check above happens on GitHub, before the
  run is queued, not again on EAS.
- A build EAS has queued but not started has no record yet, so a merge in that window builds again
  (a wasted build, nothing missed).

## The release block

`genesis.config.json` `release` says how the lane is rendered into the files. Every key is
optional; an app that sets nothing gets the default lane. Unknown keys and bad values fail, so a
typo can't silently do nothing.

```json
{
  "appFolder": "mobile",
  "release": {
    "platforms": ["ios"],
    "environment": "production",
    "paths": ["app/src", "packages/brand"],
    "sentry": true,
    "pushHook": { "script": "scripts/release-push.mjs", "secrets": ["RELEASE_PUSH_SECRET"] },
    "profile": "production",
    "channel": "production",
    "easEnvironment": "production",
    "packageManager": "pnpm",
    "runtimeVersion": "fingerprint"
  }
}
```

| Key | Default | What it changes |
| --- | --- | --- |
| `platforms` | `["ios", "android"]` | The platforms released, in `native-release.yml`, `deploy-production.yml` and `pr-preview.yml`: the other platform's jobs and steps aren't written. |
| `environment` | `production` | The GitHub environment that holds the release secrets (`EXPO_TOKEN`; `SENTRY_AUTH_TOKEN`; the hook's). Limit it to `main`. |
| `paths` | none | Folders outside the app its bundle reads (every folder its Metro config watches), from the repository root. One list for every workflow: `native-release.yml` runs on them and `pr-preview.yml` previews them. |
| `sentry` | `false` | Uploads each update's source maps to Sentry (`upload_sentry_sourcemaps` on EAS; `sentry-expo-upload-sourcemaps` on GitHub), and stops before publishing when `SENTRY_AUTH_TOKEN` is missing. |
| `pushHook` | none | A script in the app (`node <script>`) run once a release is out, per platform: after an update (GitHub or EAS) and after a submitted build (EAS). A string, or `{ "script", "secrets" }`: `secrets` are GitHub secret names passed to it on GitHub. |
| `profile` | `production` | The EAS build profile releases build with, and whose fingerprint they match. |
| `channel` | `production` | The update channel the production builds read. |
| `easEnvironment` | the profile's name | The EAS environment the lane reads its variables from (`eas env:exec`, `environment:` on EAS jobs). |
| `packageManager` | from the app's lockfile | How `native-release.yml` installs: `pnpm`, `bun`, `npm` or `yarn`. |
| `runtimeVersion` | `"fingerprint"` | How a commit's runtime version is found. `"fingerprint"`: Expo's fingerprint (`runtimeVersion: { policy: "fingerprint" }`, which `withGenesis` sets). Or `{ "command": "node scripts/runtime-version.mjs" }`: one line that prints the runtime version of the platform in `RELEASE_PLATFORM` (any form Expo takes, `1.0.0(1)` included; it runs grouped, so a pipeline or `&&` sees the platform and writes all its output), for an app that sets its own per-platform `runtimeVersion` (one derived from the native inputs it tracks, say, where the fingerprint can't see them). Builds are then matched by runtime version, and EAS's `get-build` by `runtime_version`. |

`appFolder` (top level) is where the app sits in its repository. With it, `native-release.yml`
runs on `<appFolder>/**`, `paths`, and the root's `package.json`, `pnpm-workspace.yaml` and
lockfiles (a workspace installs from there), works in that folder, and lives in the repository's own
`.github/workflows`; without it the app is the repository, and every push but documentation and CI
files (`**/*.md`, `docs/**`, `.github/**`, `.eas/**`, `.maestro/**`) releases. A phone app beside a
web app ([below](#a-phone-app-beside-a-web-app)) whose bundle reads the web app's code lists that
code in `paths`:

```json
{ "appFolder": "mobile", "supabase": { "app": "../app" }, "release": { "platforms": ["ios"], "paths": ["app/src", "app/packages/brand"] } }
```

**The release hook** gets the release in its environment: `RELEASE_KIND` (`update` or `build`),
`RELEASE_PLATFORM`, `RELEASE_COMMIT`, `RELEASE_REPOSITORY`, `RELEASE_CHANNEL`,
`RELEASE_APP_VERSION`, `RELEASE_RUNTIME_VERSION`, then `RELEASE_UPDATE_GROUP` (an update) or
`RELEASE_BUILD_ID` and `RELEASE_BUILD_NUMBER` (a build). On GitHub it runs under `eas env:exec`
(the EAS environment's plain variables), with `RELEASE_GITHUB_TOKEN` (the run's own token, which may
read pull requests) and its `secrets`; on EAS it has the EAS environment, secrets included. It runs
with Node's built-ins and the repository's files only: EAS doesn't install packages for it. Make it
safe to run twice (a re-run runs it again), and decide yourself whether a failure should fail the
job.

## One-time setup

Nothing in the templates names a real account. Before the first run:

1. **EAS project.** `eas init`, then put the project id in `starter.config.ts` (`app.easProjectId`).
2. **GitHub on EAS.** Connect the repository to the EAS project (expo.dev, project settings,
   GitHub), so `eas workflow:run --ref` and the previews can build a commit. In a monorepo, set the
   base directory to the app's folder, where `.eas/` and `eas.json` are.
3. **The GitHub environment** named in `release.environment` (default `production`), limited to
   `main` (Settings → Environments → Deployment branches):

   | Secret | When | Value |
   | --- | --- | --- |
   | `EXPO_TOKEN` | always | an Expo robot token with access to the project (Developer role) |
   | `SENTRY_AUTH_TOKEN` | `release.sentry` | a Sentry organization token (org:ci) |
   | the hook's `secrets` | `release.pushHook` | what your hook needs |

   Without `EXPO_TOKEN` the job fails at once, publishing nothing. GitHub needs these because
   `eas env:exec` can't read EAS **Secret** variables; it reads the plain ones, and the job masks
   every value it hands over except `EXPO_PUBLIC_` ones.
4. **EAS environments** (`eas env:create`, or expo.dev):

   | Environment | Variables |
   | --- | --- |
   | `development`, `preview`, `production` | `APP_VARIANT` (the environment's name), `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` |
   | `production` | `EXPO_TOKEN` (secret), for the EAS lane's update jobs and `rollout.yml`'s EAS CLI steps; `SENTRY_AUTH_TOKEN` with `release.sentry`; whatever your release hook reads on EAS |
   | `development` | `MAESTRO_TEST_EMAIL`, `MAESTRO_TEST_PASSWORD` (secret), for the `account` flows |

   `preview` also takes `PREVIEW_IOS=true` once an iOS device is registered ([Build cost](#build-cost)).
5. **Preview paths.** `genesis init --template native` fills in the app's code folder in
   `pr-preview.yml` (`src`). Copied by hand, replace `REPLACE_WITH_APP_FOLDER`; `genesis doctor`
   warns about any left (`eas-placeholder`).
6. **Store credentials.** Replace the App Store Connect app id and Apple team id in `eas.json`
   `submit.production.ios`, and set up signing (`eas credentials`) on a Mac signed in to the Apple
   Developer account, once, so EAS keeps the certificate, profiles and push key. For Google Play,
   upload a service account key with `eas credentials` and remove only `serviceAccountKeyPath`
   ([Expo's guide](https://docs.expo.dev/submit/android/)). Until you ship to Google Play, set
   `"platforms": ["ios"]`. A placeholder left in fails the submit job.
7. **Release policy.** Apply `supabase/migrations` (the `app_release_policy` table the updates
   block reads).
8. **Watch the first run.** The fingerprint is computed on GitHub's Linux runner and compared with
   builds made on EAS. If they disagree, every merge finds no build and EAS builds again each
   time: if the first JavaScript-only merge starts a build, fix the fingerprint before merging more.

## Adopting the lane

An app that has none of these files, or older copies:

```bash
genesis add template release            # in the app's folder (the one with genesis.config.json)
genesis add template release --dry-run  # what it would do
```

It writes each file that's missing, adopts one that already has the same text, and records them in
`genesis.lock.json`. A file of the same name the app already has is never written over: the new
text goes beside it as `<file>.genesis-next`, for you to merge, and the lock remembers both, so the
next upgrade merges against it. `native-release.yml` is written last, and held back while an EAS
workflow in the app still releases on a push to `main` (your old `deploy-production.yml`, kept
with the new text in `.genesis-next`; a push trigger limited to other branches, a preview lane say,
doesn't count, and neither does one only for tags): together they would publish every release
twice. It names any other workflow that releases on a push to `main` (a GitHub workflow running
`eas update`, `eas build` or `eas workflow:run`, or an EAS workflow with an update or build job, a
comment after its `type:` included; one that only runs by hand doesn't count); remove it in the
same change, and `genesis doctor` warns
(`release-lane-twice`) while one is there. Then add the secrets ([One-time setup](#one-time-setup)).

**An app that edited its choices into the files** (iPhone only, a path list): move each choice
into `release` (`platforms`, `paths`, `sentry`, `pushHook`…), then write the files from the config
over your copies, and check the diff:

```bash
genesis add template release --replace
git diff
```

`--replace` writes over your files and removes the `.genesis-next` beside them (the old text is in
git). What remains in the diff that you still want is either a setting `release` doesn't have yet
(propose it to Genesis) or a local edit, which upgrades merge three ways from then on.

**An app in a sub-folder** (`"appFolder": "mobile"`) runs the same command in that folder:
`native-release.yml` is written to the repository's `.github/workflows`, the EAS files to the
app's.

`genesis add template <set>` takes the other templates too: `eas`, `expo`, `maestro`, `ci`
(app CI, Claude review, the weekly Genesis upgrade), `database` (the database CI) and `vercel`
(Vercel's preview gate, for a web app), or one template by its path under `templates/`
(`eas/workflows/rollout.yml`). `genesis add template --list` shows what the app has. The CI
callers are written pinned to the Genesis release the app is on (`@<commit> # @marktiderman/genesis@<version>`).

## Upgrading and customising

`genesis upgrade` refreshes every file in the lock, rendered with the app's current `release`
block: a file you haven't changed takes the new version; one you changed is merged three ways, or
left with the new text in `.genesis-next`. So:

- **To change the lane**, edit `release` and run `genesis add template release` (it writes the
  files you haven't edited again, and leaves `.genesis-next` beside one you have), or wait for the
  next `genesis upgrade`.
- **Edits of your own** in the files are kept and merged, as for any owned file. Prefer a setting:
  an edit is a merge on every release.
- **With `appFolder`**, `native-release.yml` (a workflow that is Genesis's alone) is refreshed and
  merged in the repository's `.github/workflows` like any owned file. Shared CI files (`ci.yml`,
  which a repository fills with its own jobs) are still only named.
- **The CI callers' pins** (`uses: marktiderman/genesis/.github/workflows/…@<commit> # @marktiderman/genesis@<version>`)
  move with the files the upgrade writes: an owned workflow it refreshes or merges takes the new
  release's pin with its text. In a shared workflow it only names (under `appFolder`), the pin
  moves in place only when the template didn't change between the two releases; when it did, the
  reusable workflow may want new inputs, so the pin stays and the summary says to move it with
  those changes. That change stays outstanding in the lock (its checksum isn't advanced, and
  `awaiting` names the release it came with) until the repository's copy pins that release or a
  later one, so a later release whose template didn't change can't move the pin past it; once you
  have applied it and moved the pin, the next upgrade takes it and moves the pin on from there. The pin is read and written through the same path checks as owned files: a
  symlink there is refused, never followed. A workflow Genesis doesn't own is left as it is.
- **Templates the app doesn't have** are listed at the end of the summary, with the
  `genesis add template` line; nothing is added by itself.

**What an app on the old lane sees.** Before this release, `deploy-production.yml` ran on every
push to `main` on EAS. An upgrade doesn't switch an app to the new lane: its
`deploy-production.yml` is held as it is (the summary lists it as `held`), it keeps releasing the
old way, and the summary says how to adopt the new lane when you're ready: put your choices in
`release`, run `genesis add release` (`--replace` over files you edited), and add `EXPO_TOKEN` to
the GitHub environment before merging that change. Its other owned files (`pr-preview.yml`,
`rollout.yml`…) refresh as usual.

## Safety

- **Production ships only from `main`.** `native-release.yml` runs on pushes to `main` (and by
  hand, only on `main`), in a GitHub environment whose branch policy limits it to `main`.
  `deploy-production.yml` has no trigger but a dispatch, takes the commit as a required input,
  and the job that starts it always passes `--ref`. Started by hand without `--ref`, `eas
  workflow:run` would upload the working directory as it is, and nothing in the workflow can tell:
  always pass `--ref`. Its update path checks with GitHub that the commit is on `main`.
- **One path per commit and platform**, so an update is never published twice, and serialized
  runs on both sides (`concurrency`, never cancelling a release in progress).
- **An update only reaches what it should.** GitHub publishes only on a finished store build of the
  production profile with the same runtime version, and checks the published update's runtime
  version against it before the Sentry upload and the hook.
- **Store builds go to TestFlight and a Play draft**, never straight to release; each is submitted
  in the run that built it, so an update never goes to a build nobody has. A production build whose
  submit failed still matches its runtime version, so the next JavaScript-only merge sends an update
  to a binary nobody installed: submit that build by hand
  (`eas submit --platform ios --id <build id> --profile production`).
- **Nothing reaches production from a pull request.** `pr-preview.yml` and `e2e.yml` use the
  preview and development profiles, environments and channels, and have no submit, rollout or
  custom job; the starter's test fails if one names production. EAS doesn't run `pull_request`
  workflows for pull requests from forks.
- **No secrets in the files.** Tokens live in the GitHub environment and the EAS environments; the
  workflows pass inputs to shell steps only through `env`; the job masks the values `eas env:exec`
  hands over. `EXPO_TOKEN` is never in the job's `env`, which the dependency install's scripts would
  see: one step checks it, and expo-github-action hands it to the eas steps after the install.

## Cost

The lane moved the common case off EAS: a JavaScript-only merge runs one GitHub job (a few minutes
of runner time, no EAS build minutes, no queue), and EAS runs only for a native change, a merge
while a build is being made, or a merge while an EAS release run is open. A native change costs one
store build per platform, as before; a merge while EAS has a build queued but not started finds no
build record and builds again (a wasted build, nothing missed).

## Build cost

Every workflow run that builds or repacks uses EAS build minutes, and a pull request gets a new
run on each push. The templates start narrow; widen them in the app's copy when the plan allows.

| Workflow | Runs by default | Why | To widen it |
| --- | --- | --- | --- |
| `pr-preview.yml` | Pull requests into `main` whose changes touch the app's code folder, `app.json`, `app.config.*`, `eas.json`, `package.json`, a lockfile or `release.paths`; and any pull request labeled `Preview`. Android only until iOS is on. One run per branch at a time. | A docs-only pull request has nothing to install. An iOS preview is an ad hoc build, which installs only on devices registered before it was built: with none, every iOS job fails. | Add branches or paths under `on.pull_request`. Turn iOS on with `PREVIEW_IOS=true` in the `preview` EAS environment after `eas device:create`. |
| `e2e.yml` | Only by hand. | Maestro jobs need a paid EAS plan, and each run is a simulator build or repack. | Add the `pull_request` trigger in the file's header comment. |
| `native-release.yml` | Every push to `main` that changes the app. | GitHub minutes only; EAS only when it must. | Not needed. |
| `deploy-production.yml` | Only when `native-release.yml` starts it. | A store build only when native code changed. | Not needed. |
| `rollout.yml` | Only by hand. | No build. | Not needed. |

`pull_request_labeled` takes no `paths` in EAS's syntax, so adding the `Preview` label starts one
run whatever the pull request changes, when the label is added (not on later pushes). Labeling a
pull request that already matches the paths can start a second run; `pr-preview.yml`'s
`concurrency` keeps one run per branch, cancelling the older.

## What is verified, and what isn't

- Every combination of the `release` block (platforms, Sentry, hook, runtime strategy, app
  folder) renders EAS workflows that validate against EAS's public workflow schema
  (`https://api.expo.dev/v2/workflows/schema`), and a `native-release.yml` that `actionlint` passes
  (it doesn't know `environment.deployment` yet). genesis-cli's tests render them, run the plan
  script's decisions, and check that every job a job waits on is written.
- The lane as a whole runs in production in a consumer app (iOS only, `appFolder`, a push hook,
  Sentry), from which it was promoted. These templates, with Android, both runtime strategies and
  the `ios`/`android` inputs, haven't run on a live EAS project yet: watch the first native change
  and the first JavaScript-only merge after adopting them.
- Checked against eas-cli 26.0.0's source (the version the workflow pins): `build:list
  --fingerprint-hash` and `--runtime-version`, `fingerprint:generate --build-profile`, and that
  `workflow:run -F` sends values as strings (hence the `choice` inputs compared with `'true'`).
  Not run against EAS: the `runtimeVersion` command strategy, and `expo-updates
  runtimeversion:resolve` agreeing with `eas fingerprint:generate` on GitHub's runner (if they
  disagree, the check stops the publish before anything goes out).
- The pull request preview's iOS gate (`env.PREVIEW_IOS`) and `github.event.pull_request` on a
  labeled run are as the EAS docs describe, not yet seen on a live run.

## Fingerprints

With the default `runtimeVersion`, the runtime version is the native fingerprint (`withGenesis`
sets `runtimeVersion: { policy: "fingerprint" }`), so an update reaches exactly the builds whose
native code matches it, and the lane uses the same fingerprint to choose between a build and an
update.

`app.config.ts` imports `starter.config.ts`; the fingerprint would hash it as a file, so turning
off a JavaScript-only feature would give a new runtime version and strand installed builds.
`.fingerprintignore` leaves it out, and the starter's test checks that `app.config.ts` imports
nothing else and reads no JavaScript-only switch.

`fingerprint.config.js` hashes config plugins by the files they load (`configPluginSourceType:
"files"`), not by their package's `package.json`. The app loads Genesis's plugins from two packages:
`@marktiderman/genesis-cli` (`withGenesis`, a plugin-only dependency) and
`@marktiderman/genesis-native` (the rich push extension). Hashed by `package.json`, a new version of
either gives a new runtime version, and so a store build instead of an update, even when its plugin
didn't change. It also hashes each file of genesis-native's `ios/` folder (the Notification Service
Swift the rich push plugin copies into the build), found where the package is installed
(`require.resolve`) and keyed by its path inside the package. `genesis doctor` warns
(`fingerprint-plugin-files`) when an app on the fingerprint policy loads genesis-native's plugin
without it.

**Hoisted installs only.** A plugin file's path is part of the fingerprint. In a hoisted
`node_modules` (npm, Yarn's node-modules linker, pnpm with `node-linker=hoisted`, Bun with
`linker = "hoisted"`) the path doesn't change between versions. In an isolated layout (pnpm's
default, Bun's for workspaces) the real path carries the version, so every Genesis release still
changes the fingerprint. The Swift files are keyed without their path, so they're stable either
way; the plugins' own files aren't. Expo's Metro setup needs the hoisted layout anyway (the
starter's `pnpm-workspace.yaml` sets it).

Measured with `@expo/fingerprint` 0.21.6:

| Change | Fingerprint | Measured on |
| --- | --- | --- |
| `updates: false`, `queryPersistence: false` | unchanged | the starter, iOS and Android |
| `appleSignIn: false` | changed (`usesAppleSignIn` is native) | the starter, iOS and Android |
| `version` in app.config.ts | unchanged (the fingerprint leaves the version out) | the starter, iOS and Android |
| `.eas/`, `eas.json`, `.maestro/` | not hashed | the starter, iOS and Android |
| a `package.json` script, `APP_VARIANT`, `app.easProjectId` | changed | the starter, iOS and Android |
| `@marktiderman/genesis-native`'s version alone | unchanged | an app installing it from npm (hoisted), iOS |
| genesis-native's `rich-push-plugin.js`, or its `ios/` Swift | changed | an app installing it from npm (hoisted), iOS |

Inside this repository the packages are workspace links and aren't hashed by `package.json`
anyway, so the starter itself doesn't show the version rows. Android wasn't measured for them.

With the `runtimeVersion` command strategy, the fingerprint plays no part in the lane, and
`fingerprint.config.js` only matters to anything else you run `@expo/fingerprint` for.

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
  `supabase db push`, its database CI. The phone app's blocks need their database side there:
  init prints the `genesis add` line to run, and `genesis migrate` in the phone app prints it again
  for any block the web app's lock doesn't list.
- `genesis add`, `migrate` and `upgrade` in the phone app never write Supabase files.
- When the phone's bundle reads the web app's code (shared views, a brand package), list those
  folders in `release.paths`, so a change to them ships the phone app too.
- A release of the phone app that needs a new migration waits for the web app's release that
  applies it: an over-the-air update must not reach phones before the tables it reads exist.

### What the rollout check sees, and what it can't

Before promoting, `rollout.yml` reads `eas update:insights <group> --json` and stops when the
group has fewer than 200 launches or more than 1% failed launches. The limits are written in the
workflow, not inputs, so a run can't turn the check off; change them in the file, by pull request.

Rollback (`eas update:revert-update-rollout`) works while the update is staged. Once it is at
100% the rollout is over and the revert fails: republish the group before it instead
(`eas update:republish --group <id>`).

EAS's "crash rate" for an update is **failed launches**: expo-updates couldn't start the update and
fell back to the code before it. It is not crash-free sessions; a crash after the app started
isn't counted. Before every promotion, open your crash reporter's release health for the update
and compare crash-free sessions with the update before it. Promote only if it is no worse.

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

`templates/` holds the canonical copies; the CLI's build packs them, so each CLI release carries
its own. Templates with release markup (`#@if ios`, `#@paths`, `GENESIS_RELEASE_…` tokens, all on
comment lines or in plain values) are rendered with the app's `release` block when written; the
starter keeps the default render, and genesis-cli's tests check it matches. The others the starter
keeps byte for byte (`__tests__/release.test.ts`). An app copied by hand has no lock entries:
`genesis add template <set>` adopts them.

## Validating the workflows

`eas workflow:validate <file>` checks a file against EAS's schema and then on EAS's servers, so it
needs a login and a project id. Offline, the same schema checks can be run against the public
schema (`https://api.expo.dev/v2/workflows/schema`); that is how these templates were checked. The
server-side step wasn't run.
