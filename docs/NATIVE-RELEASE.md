# Native release

How a Genesis native app goes from a pull request to phones: previews on EAS for pull requests, a
release lane on every merge to `main` (Expo's "deploy to production" workflow, run by EAS Workflows
itself: an over-the-air update when a store build has the commit's runtime version, a store build
and submission when native code changed), Maestro smoke flows, and a manual rollout. Every Genesis
app gets the files from Genesis, versioned with `@marktiderman/genesis-cli`, and changes them in
its own `genesis.config.json`, not by editing them. Why the release starts on EAS and not on
GitHub Actions: [ADR 0026](adr/0026-eas-owns-the-release-trigger.md).

| File (in the app) | Template | What it does |
| --- | --- | --- |
| `.eas/workflows/deploy-production.yml` | `templates/release/deploy-production.yml` | Every push to `main` that changes the app (EAS Workflows' own trigger): per platform, an over-the-air update on a store build with the commit's runtime version, or a store build submitted in the same run ([The release path](#the-release-path)). |
| `.github/workflows/native-release.yml` | `templates/ci/native-release.yml` | Only with `release.trigger: "github"`: GitHub Actions starts each release instead, publishing JavaScript-only updates itself and handing the rest to a dispatch-only `deploy-production.yml` ([GitHub's trigger](#githubs-trigger)). |
| `.eas/scripts/native-release.mjs` | `templates/eas/scripts/native-release.mjs` | The lane's decisions (plan, masks, the build profile's env, the runtime checks), kept out of the YAML so they are tested. |
| `fingerprint.config.js`, `.fingerprintignore` | `templates/expo/` | What the runtime version hashes ([Fingerprints](#fingerprints)). |
| `.eas/workflows/pr-preview.yml` | `templates/release/pr-preview.yml` | A pull request into `main` that changes the app, or one labeled `Preview` ([Build cost](#build-cost)): publish its JavaScript to the channel `pr-<number>` for the release builds people already have, and comment a preview link and QR code ([Previews](#previews)); when it changed native code, repack or build a preview build instead (iOS only once `PREVIEW_IOS=true`). |
| `.github/workflows/pr-preview-teardown.yml` | `templates/ci/pr-preview-teardown.yml` | A pull request closing: delete its channel and branch `pr-<number>` ([Previews](#previews)). |
| `.eas/workflows/rollout.yml`, `.eas/scripts/rollout-health.mjs` | `templates/eas/` | By hand: promote an update you staged by hand (after a failed-launch check), or roll it back. |
| `.eas/workflows/e2e.yml`, `.maestro/` | `templates/eas/`, `templates/maestro/` | By hand (Maestro needs a paid EAS plan): the Maestro flows on an iOS simulator build. |
| `eas.json` | `templates/eas/eas.json` | Build profiles `development`, `preview`, `e2e` and `production`, each with its `APP_VARIANT`, EAS environment and channel; store submission with placeholder ids. |

`genesis init --template native` writes them all. An existing app adopts them with
`genesis add template release` ([Adopting the lane](#adopting-the-lane)); `genesis upgrade` keeps
them current ([Upgrading and customising](#upgrading-and-customising)).

## The release path

One workflow owns a merge: `deploy-production.yml`, started by EAS Workflows on the push (the EAS
project is linked to the GitHub repository), as Expo documents it
([Deploy to production](https://docs.expo.dev/eas/workflows/examples/deploy-to-production/)).
Nothing on GitHub Actions takes part, so a GitHub billing or runner problem never stops a release.

1. **Pull request.** `pr-preview.yml` publishes it to the channel `pr-<number>` ([Previews](#previews)).
2. **Merge into `main`.** That merge is the release. Bump `version` in `app.config.ts` in the same
   change when it changes native code and you mean to release it; the build number goes up by itself
   (`appVersionSource: "remote"`, `autoIncrement`).
3. **`deploy-production.yml`** runs on the push when it changes the app (`on.push.paths`: everything
   but docs, Markdown and CI files; under `appFolder`, the app's folder, `release.paths` and the
   root's install files). `[eas skip]`, `[skip eas]` or `[no eas]` in the commit message skips
   it: EAS doesn't start the run
   ([syntax](https://docs.expo.dev/eas/workflows/syntax/#on), "Workflow doesn't start" in
   [troubleshooting](https://docs.expo.dev/eas/workflows/troubleshooting/)).
   - `source` fails, and so stops every job, unless `main` contains the commit; checks eas.json's
     profile still builds on `release.channel` with the EAS environment the file was rendered with.
   - per platform, in a job of its own (`runtime_<platform>`, so one platform's failure holds back
     only it), `native-release.mjs runtime-version` finds the runtime version as a production build
     records it (`eas fingerprint:generate --build-profile <profile>`, the profile's env over the
     EAS environment's, or your `release.runtimeVersion` command). A platform whose runtime
     version can't be found is neither built nor published. The publishing is in the script too
     (`native-release.mjs publish`): EAS refuses a workflow file over 16 KiB
     ([syntax](https://docs.expo.dev/eas/workflows/syntax/), "Workflow files"), and `genesis
     doctor` errors (`eas-workflow-size`) on one.
   - per platform, `get-build` finds a production build on the release channel with that runtime
     version, finished or still being made (`wait_for_in_progress`): this commit goes out as an
     update on it (the lane's script: the profile's env, the runtime checked before and after, the
     channel's latest update read first, then Sentry and your hook);
   - none (native code changed): build, then submit to TestFlight and Google Play's internal track
     as a draft. Releasing to the stores stays your step in App Store Connect and Play Console.
4. **Order.** One run at a time (`concurrency`, never cancelling the one in progress). As Expo
   recommends for deploys, a newer push waits and EAS replaces the runs waiting in between with it:
   each run releases both platforms of its commit, and the newest commit on `main` carries every
   older one. The update jobs still read the channel's latest update just before publishing and
   skip, out loud, when it already carries this commit or a later one.
5. **By hand:** `eas workflow:run deploy-production.yml --ref main` releases `main` as it is.
   `source` refuses three cases: a run with no git checkout (an uploaded folder), a checkout with
   changes that aren't committed, and, by hand, any commit but `main`'s latest.
   **To take an update back**, republish the update group before it (`eas update:republish --group
   <id>`); step 5 of [GitHub's trigger](#githubs-trigger) has the rest, the same for both triggers.

### GitHub's trigger

With `"release": { "trigger": "github" }`, GitHub Actions starts each release instead: a runner
starts in seconds where an EAS job can queue, so a JavaScript-only merge reaches phones sooner, at
the cost of depending on GitHub Actions (its minutes, its billing) for every release. Only one of
the two triggers is ever written: `native-release.yml` is, and `deploy-production.yml` becomes
dispatch-only. The rest of this section is that lane.

1. **Pull request.** `pr-preview.yml` publishes the pull request to the channel `pr-<number>` and
   comments a preview link: opened on a phone with the TestFlight or store build, the app asks,
   restarts into the preview and shows a Preview banner until you leave it ([Previews](#previews)).
   Run
   `e2e.yml` by hand for the Maestro flows (`eas workflow:run e2e.yml --ref <branch>`).
2. **Merge into `main`.** That merge is the release: `main` takes pull requests only, from the
   people allowed to merge into it. A merge that changes native code is a new store version once
   it's released: bump `version` in `app.config.ts` in the same change when you mean to release it
   (the version isn't part of the fingerprint, so a bump alone starts no build).
3. **`native-release.yml`** (GitHub Actions; a runner starts in seconds, where an EAS job can queue
   for most of an hour) runs on the push. Per platform it finds the commit's runtime version (Expo's
   fingerprint as the production build profile computes it, or your command: [The release
   block](#the-release-block)) and the finished production store builds on the release channel
   that have it, lists the open runs of `deploy-production.yml` (first, so an EAS run that
   finishes after that shows in the channel), and reads the channel's latest update. It stops first
   when eas.json's production profile names another channel than `release.channel`: its builds
   would take none of the updates.
   - **The channel's latest update already carries this commit or a later one** (GitHub ran a later
     commit's release first, or this is a re-run): nothing is published or built for that platform,
     and the run says so (a warning and a line in the job summary), so an older commit never
     overwrites a newer one.
   - **A finished build has it, and no EAS release run is open** (most merges: JavaScript only):
     with the build's environment (the EAS environment, then the build profile's `env` for that
     platform over it: eas.json, `<platform>.env` over the common one, along `extends`), it checks
     this checkout's runtime version (`expo-updates runtimeversion:resolve`) is the build's, then
     publishes the update to the `production` channel for that platform, checks the update went to
     that runtime version, then runs your release hook and uploads the source maps to Sentry, in
     that order, when those are on (the source maps are also kept as an artifact for a re-run). Only those commands get the profile's env (`native-release.mjs with-profile`,
     inside `eas env:exec`), and `eas update` runs without `--environment`, which would bundle with
     the EAS environment's values over the profile's.
   - **Otherwise** (native code changed, or the build with this runtime version is still being
     made, or an EAS release run is open): nothing is published here for that platform. The job
     starts `deploy-production.yml` on EAS for that commit and those platforms
     (`eas workflow:run --ref <commit> -F commit_sha=<commit> -F ios=true -F ios_runtime_version=<…> -F android=false …`).
     `ios` and `android` are choices compared as text (`"$RELEASE_IOS" = true`): `-F` sends every
     value as a string, so a boolean `false` would read as true. The runtime versions are the ones
     computed here, with the build profile's env, so EAS matches builds on the same value.

   Each platform of each commit takes exactly one of the two paths, so an update is never published
   twice. A failure on one platform doesn't hold the other back: the Android update still publishes
   after a failed iOS one, and EAS still gets what it should; a platform whose own planning failed
   (its runtime version, builds or latest update) is neither published nor handed to EAS, the other
   goes on, and the job fails at its end. A failed shared check (the profile's channel, EAS's run
   list, the Sentry token) stops every platform's publish.
4. **`deploy-production.yml`** (EAS, only when started), per platform it was given:
   - a build with the runtime version, finished or still being made (`get-build` waits for one in
     progress): publish this commit as an update on it, with the same steps as GitHub (the
     platform's profile env over the EAS environment, the runtime version checked before and after;
     it runs `eas-cli` with `EXPO_TOKEN` from the EAS environment, and keeps its own files outside
     the checkout, which `cli.requireCommit` wants clean). When the source maps fail to reach Sentry
     after the update went out, the release hook still runs, then the run fails saying so;
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
`deploy-production.yml` is open (any status but finished: new, in progress, waiting, awaiting
approval, or one eas-cli adds later; finished is `SUCCESS`, `FAILURE` or `CANCELED`), every later
commit goes to EAS too, for every platform, instead of publishing an update the older EAS run would
then overwrite. On EAS, runs are serialized (`concurrency`, never cancelling one in progress, with
`queue: max`, so every waiting run is kept: one for a platform never replaces one for the other):
each finishes before the next starts, in the order GitHub started them, which is the order the
commits reached `main` (GitHub's runs are serialized too, on the job, so a push skipped with
`[eas skip]` never takes a release's waiting place). GitHub doesn't promise to start runs in push order, so before
publishing or handing a platform to EAS, each run checks the channel's latest update (the branch or branches the channel serves, from
`eas channel:view <channel>`, which needn't be named after it; the newest group on each from
`eas update:list --branch`, then its commit from `eas update:view <group>`; none before the first
release, when the channel or its branch doesn't exist yet): when it already carries this
commit or a later one (`git merge-base --is-ancestor`), the run skips that platform out loud. It never skips because a later commit is expected to ship, which could drop a release
silently. Left over:
- Both paths also skip when the build the update would run on was made from this commit or a later
  one (`gitCommitHash` from `eas build:list` on GitHub, get-build's `git_commit_hash` on EAS): a
  later commit that changed native code may have run first and built, with no update yet.
- Both lanes read the channel's latest update again just before `eas update` (after the runtime
  check), so a run that published this commit or a later one in the meantime stops this one.
  `get-build` on EAS matches only builds on the release channel (`channel`), as the GitHub plan does.
- Every run of `deploy-production.yml` (a manual one too) checks first, in `source`, that eas.json
  still matches what it was rendered with, for the platforms it releases: the profile's channel and
  the EAS environment its builds read.
- `deploy-production.yml` refuses a run that `native-release.yml` didn't start (`-F
  handoff=native-release`, which it sends) unless it's given `-F manual=true`. Releases started by
  hand go through Actions ("Native release", Run workflow). A run started on EAS with
  `manual=true` is serialized only with other EAS runs, not with GitHub's: the checks just before
  publishing narrow the race to the time `eas update` takes to bundle and upload (minutes), during
  which an older commit's run on the other side can still land over it.
- The EAS lane's update jobs make both checks just before they publish (eas-cli pinned through
  `npx --yes eas-cli@26.0.0`, and the commits fetched when the checkout lacks them): an EAS run that
  lands after a newer commit's update or build logs "Not published" and skips, and its release hook
  doesn't run. The checks fail open: when a commit can't be fetched or compared, or the build or
  update records none, the run publishes, so a late run can still land over a newer one then. A
  channel that can't be read at all (an API error, a bad token) stops the run, publishing nothing.
- A build EAS has queued but not started has no record yet, so a merge in that window builds again
  (a wasted build, nothing missed).

## Moving to EAS's trigger

New apps start on EAS's trigger. An app already on GitHub's stays there until it chooses to move.
With no `release.trigger` set and a `native-release.yml` in place, the trigger reads as
`"github"`, and `genesis upgrade` writes that into genesis.config.json. `genesis doctor` warns
(`release-trigger-github`) and names the move. Before moving:

1. Link the repository to the EAS project ([One-time setup](#one-time-setup), step 2).
2. Put `EXPO_TOKEN`, `SENTRY_AUTH_TOKEN` (with Sentry) and your hook's secrets in the EAS
   environment the release reads. GitHub's environment no longer takes part.
3. With a release hook, add `RELEASE_GITHUB_TOKEN` ([The release hook](#the-release-block)): a
   fine-grained token, stored as an EAS secret and listed in `release.pushHook.secrets`.
4. Optional: say where a failure goes ([When a release fails](#when-a-release-fails)).

Then run `genesis add template release --trigger eas`, with `EXPO_TOKEN` set or after `eas login`.
It writes the choice, asks Expo's API whether the EAS project has a GitHub repository linked, and
moves in one change: `deploy-production.yml` takes the push trigger, and the unedited
`native-release.yml` is removed. It never does one without the other, so a merge always has
exactly one owner. It holds both, saying what's left, when:

- the link can't be confirmed (not linked, no login, offline);
- a release hook doesn't list `RELEASE_GITHUB_TOKEN`;
- `native-release.yml` has your edits (or isn't in `genesis.lock.json`) and still runs on push.
  Remove it, or run with `--replace`. An edited copy with no push trigger is kept, never deleted;
- another workflow releases on push. Remove it, or run with `--replace-rival` in the change that
  does.

`genesis upgrade` makes the same move for an app that sets `"trigger": "eas"` itself, with the same
checks. It keeps `native-release.yml` while `deploy-production.yml`'s change waits in a
`.genesis-next`.

The trade-off: JavaScript-only updates wait for an EAS worker instead of a GitHub runner. That is
minutes on a paid plan's priority queue, and longer on the free plan.

`genesis doctor` checks the lane can run (`release-lane-live`): an error when
`deploy-production.yml` is dispatch-only with nothing to start it, and a warning when the files are
on the other trigger than `release.trigger`. It also checks that only one lane releases
(`release-lane-twice`).

## When a release fails

A failed release is a failed run of `deploy-production.yml` on expo.dev, under the project's
Workflows, and a failed commit status on GitHub: Expo Workflows sets one for runs GitHub started
([syntax](https://docs.expo.dev/eas/workflows/syntax/), "Waiting and canceled runs"). But nobody is
emailed by default. A run started with `eas workflow:run` sets no commit status. With GitHub's
trigger it is also a failed Actions run on the commit, which GitHub emails to whoever pushed it.
To be told:

- **`release.failureEmails`**: the run's `release_failed_email` job (Expo's `email` job) emails
  these addresses when any job failed.
- **`RELEASE_FAILURE_WEBHOOK`**: an incoming webhook URL that takes Slack's `{ "text": … }` (a
  Slack incoming webhook, or anything compatible), as a secret in the EAS environment. The run's
  `release_failed` job posts the commit, the repository and the channel to it. Without the
  webhook, the job only logs.
- `eas workflow:runs --workflow deploy-production.yml --status FAILURE` lists failed runs, and
  `eas workflow:insights` shows the success rate.

A job that skips on purpose doesn't fail the run: for example, a channel that already carries this
commit (logged "Not published").

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
| `trigger` | `"eas"`, or `"github"` for an app that already has `native-release.yml` | What starts a release on a merge to `main`. `"eas"`: `deploy-production.yml`'s own push trigger on EAS Workflows. `"github"`: `native-release.yml` on GitHub Actions ([GitHub's trigger](#githubs-trigger)). Only one of the two is written. Change it with `genesis add template release --trigger <eas\|github>` ([Moving to EAS's trigger](#moving-to-eass-trigger)). |
| `failureEmails` | none | With EAS's trigger: who is emailed when a release run fails ([When a release fails](#when-a-release-fails)). |
| `platforms` | `["ios", "android"]` | The platforms released, in `native-release.yml`, `deploy-production.yml` and `pr-preview.yml`: the other platform's jobs and steps aren't written. |
| `environment` | `production` | With `trigger: "github"`: the GitHub environment that holds the release secrets (`EXPO_TOKEN`; `SENTRY_AUTH_TOKEN`; the hook's). Limit it to `main`. |
| `paths` | none | Folders outside the app its bundle reads (every folder its Metro config watches), from the repository root. One list for every workflow: `native-release.yml` runs on them and `pr-preview.yml` previews them. |
| `sentry` | on when `observability.sentry` names a project, else `false` | Uploads each update's source maps to Sentry with the app's own `sentry-expo-upload-sourcemaps`, in both lanes (GitHub and EAS) and in `pr-preview.yml` (each platform's preview update), and stops before publishing when `SENTRY_AUTH_TOKEN` or the uploader is missing. On GitHub the release hook (when there is one) runs first, then the upload; on EAS the upload runs in the update job, then the hook job runs (also after a failed upload). A failed upload fails the run either way. Set it `false` to keep update uploads off while builds upload. |
| `pushHook` | none | A script in the app (`node <script>`) run once a release is out, per platform: after an update (GitHub or EAS) and after a submitted build (EAS). A string, or `{ "script", "secrets" }`: `secrets` are GitHub secret names passed to it on GitHub. |
| `profile` | `production` | The EAS build profile releases build with, and whose fingerprint they match. |
| `channel` | `production` | The update channel the production builds read: the build profile's `channel` in eas.json. The release stops when the profile names another, and matches only builds on it. |
| `easEnvironment` | the one the profile's builds read | The EAS environment the lane reads its variables from (`eas env:exec`, `environment:` on EAS jobs). Unset, the CLI takes it from eas.json as eas-cli does for a build: the profile's `environment` (along `extends`), else `production` for a store distribution (the default), `development` for a development client, `preview` otherwise. Each release checks it against eas.json before planning and stops when the profile's builds read another one. |
| `packageManager` | from the app's lockfile | How `native-release.yml` installs: `pnpm`, `bun`, `npm` or `yarn`. |
| `runtimeVersion` | `"fingerprint"` | How a commit's runtime version is found. `"fingerprint"`: Expo's fingerprint (`runtimeVersion: { policy: "fingerprint" }`, which `withGenesis` sets). Or `{ "command": "node scripts/runtime-version.mjs" }`: one line that prints the runtime version of the platform in `RELEASE_PLATFORM` (any form Expo takes, `1.0.0(1)` included; it runs as a script of its own under `eas env:exec` with the build profile's env for the platform, so it sees what the build saw, and a pipeline or `&&` runs whole; its last line is taken, and an empty, `undefined` or `null` one stops the release), for an app that sets its own per-platform `runtimeVersion` (one derived from the native inputs it tracks, say, where the fingerprint can't see them). Builds are then matched by runtime version, and EAS's `get-build` by `runtime_version`. |

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
read pull requests) and its `secrets`. On EAS it has the EAS environment, secrets included, and no
GitHub run token. A hook that reads GitHub (say, the merged pull request for a "What's new") then
needs a fine-grained GitHub token, for this repository with Pull requests: read. Store it as an EAS
secret under the same name, `RELEASE_GITHUB_TOKEN`, so the hook's code doesn't change, and list it
in `pushHook.secrets`. The move to EAS's trigger holds until it's listed. On GitHub the listed name
still takes the run's own token. `RELEASE_REPOSITORY` is the repository's `owner/name`; on a run
started by hand it is read from the checkout's `origin`. It runs
with Node's built-ins and the repository's files only: EAS doesn't install packages for it. Make it
safe to run twice: a re-run of a release whose update already went out (this commit is the
channel's latest) publishes nothing again but runs the hook again, with that update's group
(recovered from the channel). With Sentry on, GitHub keeps each update's `dist` (bundle and source
maps) as an artifact for 7 days (`sourcemaps-<platform>-<commit>`), and a re-run of that run
downloads it and uploads the source maps again. When it can't (another run published the update,
or the artifact expired), and on EAS, which keeps nothing a later run can rely on, the run says so:
upload them from this commit's export by hand. Decide yourself whether a hook failure should fail
the job.

### Sentry source maps

One switch turns readable Sentry stack traces on: the top-level `observability.sentry` in
genesis.config.json, with the Sentry organization and project slugs.

```json
{ "observability": { "sentry": { "organization": "acme", "project": "sample-app", "url": "https://sentry.io/" } } }
```

With both set, `release.sentry` defaults to true, so the next `genesis add template release` (or
`genesis upgrade`) writes the update uploads into the release workflows. The starter (and an app made
with `genesis init --template native`) also adds the `@sentry/react-native/expo` plugin in
`app.config.ts`, so each EAS build uploads its source maps, and builds Metro on
`getSentryExpoConfig` (`@sentry/react-native/metro`), whose Debug IDs let Sentry match a bundle to
its map. Builds have no switch of their own: the plugin uploads, and without `SENTRY_AUTH_TOKEN` in
the build's EAS environment the build fails rather than ship minified traces (the development
profile sets `SENTRY_DISABLE_AUTO_UPLOAD`, so it needs no token). Empty slugs, or no block, leave
all of it off.

`SENTRY_AUTH_TOKEN` (a Sentry organization token, scope `org:ci`) goes in every EAS environment
that builds or publishes updates and in the GitHub release environment ([One-time setup](#one-time-setup)).
`genesis doctor` flags each missing piece in an app on Sentry (`cli/sentry-source-maps`: Metro
without Debug IDs, the Expo plugin missing, a workflow that publishes updates without uploading,
a web Vite build without Sentry's source maps plugin), and `genesis fix cli/sentry-source-maps`
writes what it can and lists the token step. Sentry's "InternalBytecode.js has no debug ID" note
is Hermes's built-in code, which has no source map: ignore it.

## One-time setup

Nothing in the templates names a real account. Before the first run:

1. **EAS project.** `eas init`, then put the project id in `starter.config.ts` (`app.easProjectId`).
2. **GitHub on EAS.** Connect the repository to the EAS project (expo.dev, project settings,
   GitHub; it installs Expo's GitHub app). EAS Workflows' push and pull request triggers need it:
   without it a merge starts no release and a pull request no preview. In a monorepo, set the
   base directory to the app's folder, where `.eas/` and `eas.json` are.
3. **Only with `trigger: "github"`, the GitHub environment** named in `release.environment`
   (default `production`), limited to `main` (Settings → Environments → Deployment branches):

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
   | `preview-release` (`release.previews.easEnvironment`) | The `production` environment's plain values (`APP_VARIANT=production` and the `EXPO_PUBLIC_*` ones), `EXPO_TOKEN` (secret, a robot token), `SENTRY_AUTH_TOKEN` with Sentry. No other secrets: a pull request's code reads it ([Previews](#previews)) |
   | `production` | `EXPO_TOKEN` (secret), for the release's `source` and update jobs and `rollout.yml`'s EAS CLI steps; `SENTRY_AUTH_TOKEN` with `release.sentry`; whatever your release hook reads on EAS |
   | `preview`, `production` | `SENTRY_AUTH_TOKEN` (secret) with `observability.sentry`: the Sentry Expo plugin uploads each build's source maps with it, and a build without it fails ([Sentry source maps](#sentry-source-maps)) |
   | `development` | `MAESTRO_TEST_EMAIL`, `MAESTRO_TEST_PASSWORD` (secret), for the `account` flows |

   `preview` also takes `PREVIEW_IOS=true` once an iOS device is registered ([Build cost](#build-cost)).
5. **Preview paths.** `genesis init --template native` fills in the app's code folder in
   `pr-preview.yml` (`src`). Never copy a release template from `templates/` by hand: its release
   markup (`#@if` blocks, the release tokens) only works once rendered. Write it with the CLI
   (`genesis add template release`), or copy a file rendered with your own `release` settings.
   The starter's copies are the default render (both platforms, `production`), so an app with
   other settings (iPhone only, another profile or channel) must use the CLI rather than copy
   them. Then replace `REPLACE_WITH_APP_FOLDER`; `genesis doctor` warns about any left
   (`eas-placeholder`).
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
`genesis.lock.json`. In an app below its repository's root with no `appFolder`, it sets `appFolder`
first, so GitHub workflows go to the root's `.github/workflows`. GitHub never reads them from the
app's folder, so `adoptTemplates` alone holds them there. It never writes `fingerprint.config.js` or
`.fingerprintignore` into an app that already builds (`eas.json`), or beside a fingerprint config of
the app's own, unless run with `--replace`. Either file changes what the runtime version hashes, so
installed builds would stop taking updates until the next store build. A file of the same name the app already has is never written over: the new
text goes beside it as `<file>.genesis-next`, for you to merge, and the lock remembers both, so the
next upgrade merges against it. `native-release.yml` is written last, and held back (the command
exits 1, naming them) while any other workflow still releases on a push to `main`: together they
would publish every release twice. That is your old `deploy-production.yml` (kept with the new text
in `.genesis-next`), or any other: a GitHub workflow running `eas update`, `eas build` or
`eas workflow:run`, or an EAS workflow with an update or build job, a comment after its `type:`
included, or a custom job whose steps run one of those commands. Only a step's `run` counts, not a
comment; a query such as `eas build:list` doesn't, nor does a workflow that only runs by hand, a
push trigger limited to other branches (a preview lane, say) or one only for tags. In branch
filters `*`, `**` and `[…]` classes such as `m[ae]in` match as on GitHub, but `?` is read as any one
character and `+` as itself, not as GitHub's quantifiers. Merge the `.genesis-next` (or run with
`--replace`) and remove the others, then run it again; or run it with `--replace-rival` to write
`native-release.yml` now, in a change that also removes the others (the command doesn't delete
them, and names them in its summary). `--replace-rival` never passes over your old
`deploy-production.yml`: `native-release.yml` starts that file on EAS, so it is merged into the
lane's version, never removed, and `native-release.yml` stays held until it is. `genesis doctor` fails (`release-lane-twice`, an error) while one is
there beside `native-release.yml`. The check reads commands, not what they publish, so a push
lane that only ships a staging update or a preview build (`eas update --branch staging`,
`eas build --profile preview`) counts too: when it doesn't release to production, keep it, run
`genesis add template release --replace-rival`, and lower the rule in `genesis.config.json`
(`"doctor": { "rules": { "release-lane-twice": "warn" } }`). Then add the secrets ([One-time setup](#one-time-setup)).

**One native app per repository.** The lane is one GitHub workflow at a fixed path
(`.github/workflows/native-release.yml`, at the repository's root under `appFolder`) with one
concurrency group (`native-release-<ref>`). A second native app in the same repository would need
the same file (`genesis add release` there leaves its text in `.genesis-next`, since the first app's
is already there) and would queue behind the first one's releases, so the lane supports one native
app per repository. A web app beside it (its own CI, no `native-release.yml`) is fine.

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

The workflows run the app's own genesis-cli (`genesis build-stamp`) through
`node .eas/scripts/native-release.mjs genesis …`. That finds the package as Node resolves it: the
app's `node_modules`, then each folder above, such as a workspace root's for an app in a subfolder.
It runs the version the lockfile pins, and never fetches one.

`genesis add template <set>` takes the other templates too: `eas`, `expo`, `maestro`, `ci`
(app CI, Claude review, the weekly Genesis upgrade), `database` (the database CI) and `vercel`
(Vercel's preview gate, for a web app), or one template by its path under `templates/`
(`eas/workflows/rollout.yml`). `genesis add template --list` shows what the app has. The `eas` set
leaves a `deploy-production.yml` that still releases on push as it is (`held`) when the app has no
`native-release.yml`: the lane's dispatch-only one would leave nothing to start a release. Adopt
the lane with the `release` set. The CI
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
  those changes. A pin never moves backwards: a caller already on a later release keeps it. That change stays outstanding in the lock (its checksum isn't advanced, and
  `awaiting` names the newest release that changed the template, by its version alone when its
  commit can't be looked up; a later change moves it forward)
  until the repository's copy pins that release or a later one, so a later release whose template didn't change can't move the pin past it; once you
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

**An upgrade run by the previous genesis-cli** (the weekly upgrade workflow runs the app's installed
CLI, which installs this release and refreshes with its own code): the release lane's EAS
workflows moved to `templates/release/` when they took the release markup, so that CLI finds
nothing at their old paths and leaves the app's `deploy-production.yml` and `pr-preview.yml` as they
are ("gone upstream"), rather than writing unrendered markup or the dispatch-only lane over them.
The next upgrade, by this CLI, names them at their new paths in the lock and goes on as above.

## Safety

- **Production ships only from `main`.** With EAS's trigger, `deploy-production.yml` runs on
  pushes to `main` and by hand. With GitHub's, `native-release.yml` runs on pushes to `main` (and
  by hand, only on `main`), in a GitHub environment whose branch policy limits it to `main`, and
  `deploy-production.yml` has no trigger but a dispatch, takes the commit as a required input,
  and the job that starts it always passes `--ref`. Its first job, `source`, which every other job
  waits on, fails unless the checkout is that commit (started with `--ref`, not an uploaded
  folder) and `main` contains it (`git fetch origin main`, then `merge-base --is-ancestor`): a
  manual run from a feature branch builds and publishes nothing. It fails closed when the fetch
  does.
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
- **Nothing reaches production from a pull request.** No pull request workflow submits, builds
  with the production profile, or publishes to the release channel: `pr-preview.yml` publishes
  only to `pr-<number>`, and its builds use the preview profile; `e2e.yml` uses the development
  one. genesis-cli's tests and the starter's fail if one does. The preview update is built with
  the release's EAS environment (it has to match the build it loads on), so keep anything a pull
  request mustn't read out of that environment. EAS doesn't run `pull_request` workflows for pull
  requests from forks.
- **No secrets in the files.** Tokens live in the GitHub environment and the EAS environments; the
  workflows pass inputs to shell steps only through `env`; the job masks the values `eas env:exec`
  hands over. On EAS the update jobs check `SENTRY_AUTH_TOKEN` (with Sentry on) before they
  publish, as GitHub's Sentry check step does. `EXPO_TOKEN` is never in the job's `env`, which the dependency install's scripts would
  see: one step checks it, and expo-github-action hands it to the eas steps after the install.
- **npx never fetches an unpinned package.** The app's own tools run with `npx --no`
  (`expo-updates`, `sentry-expo-upload-sourcemaps`), which fails rather than install one; a
  package npm might serve under the same name (one with the Sentry uploader's name exists, from
  someone else) is never run with the release's secrets. With Sentry on, the run first checks
  `@sentry/react-native` is installed and says so if not. eas-cli on EAS runs pinned
  (`npx --yes eas-cli@26.0.0`). genesis-cli's tests fail on any other npx form in the templates.

## Previews

Each pull request is an update on its own channel, `pr-<number>`, opened by a link in the app
people already have. No device registration, no new build, and anyone with the link can open it.

**Who decides it runs, and what it can read.** EAS runs a preview from the pull request's own head
commit, before anyone has merged it: the pull request's `app.config.ts`, its install scripts and
its copy of the scripts all run in the preview's jobs. So:

- **Previews run when someone adds the `Preview` label.** A reviewer adds it once they've read the
  change; add it again after new pushes. With `release.previews.everyPullRequest`, every pull
  request into `main` (and `release.previews.branches`) that changes the app runs too. Turn that
  on only where everyone who can push is trusted.
- **They read an EAS environment of their own**, `release.previews.easEnvironment` (default
  `preview-release`), never the release's. Copy the release environment's plain values there (the
  `EXPO_PUBLIC_*` ones, `APP_VARIANT`), so the fingerprint and the bundle match the release builds.
  Add `EXPO_TOKEN` (a robot token for this project, to publish `pr-<number>`) and, with Sentry,
  `SENTRY_AUTH_TOKEN`. Never add the release hook's secrets, `RELEASE_GITHUB_TOKEN` or
  `RELEASE_FAILURE_WEBHOOK`. `genesis doctor` warns (`preview-environment`) when `pr-preview.yml`
  reads the release's environment.
- **What's left:** anyone who can push a branch can write a workflow in it that names any EAS
  environment, the release's included, and EAS runs it from that branch. Keep write access to
  people you trust, use an Expo robot token scoped to this project, and keep server keys out of
  every EAS environment.

1. **The lane.** `pr-preview.yml` fingerprints the pull request as the release builds it. When a
   release build (TestFlight or store) has that fingerprint, the pull request changed no native
   code: it publishes the JavaScript to the branch `pr-<number>`, points the channel of the same
   name at it, and comments the link and a QR code. Per platform: one with no matching release
   build (its native code changed) gets a preview build instead, repacked from a preview build
   with the preview variant's fingerprint or built, and the comment says so. The update is
   exported as the release lane publishes: the release profile's eas.json `env` over the job's EAS
   environment, without `--environment`, and only for a platform whose fingerprint, computed with
   that profile, matches the release build's. The QR
   code's scheme is `release.previews.scheme`, else the app's resolved Expo config.
   `pr-preview-teardown.yml` deletes the channel and branch when the pull request closes, waits
   until EAS has no preview run queued or running (up to 45 minutes), and deletes again.
2. **The link.** `https://<origin>/preview?channel=pr-42` (a universal link, with
   `release.previews.origin`) or `<scheme>:///preview?channel=pr-42` (the QR code, with
   `release.previews.scheme`, which defaults to `app.json`'s `expo.scheme`). genesis-native's
   `normalizeLink` turns either, and Expo's development-client QR, into `/preview?channel=pr-42`
   when the app's own link map has no pattern for that path; `links.previews: false` turns that off. The app's
   `app/preview.tsx` renders `PreviewScreen`, and `+native-intent.ts` doesn't hold `/preview`
   for sign-in.
3. **The switch.** `createUpdates({ channels: { enabled: true } })` turns channel switching on in
   release builds (it can't work in a development client). `PreviewScreen` confirms, downloads with
   `channels.prepare`, then restarts with `channels.restart`. While a preview is open the updates
   block draws `PreviewNotice` (slot `previewNotice`) over every screen; Leave calls
   `channels.reset`. A preview whose channel was deleted heals by itself: EAS answers "no channel
   named …", and `channels.recover` drops the override.

| Config | Default | What it does |
| --- | --- | --- |
| `release.previews.origin` | none | The web origin the comment links to (`https://acme.app`). Serve `/preview` there with an associated-domains (AASA and assetlinks) entry, and a page for a browser without the app. Unset, the comment links the scheme. |
| `release.previews.everyPullRequest` | `false` | Previews every pull request that changes the app, not only labeled ones. The pull request's code runs before review: only where everyone who can push is trusted. |
| `release.previews.easEnvironment` | `preview-release` | The EAS environment preview jobs read: the release's plain values and a preview `EXPO_TOKEN`, no release secrets. |
| `release.previews.branches` | none | Base branches besides `main` whose pull requests get previews (globs, such as `staging/**` for staging batches). |
| `release.previews.scheme` | `app.json` `expo.scheme` when there's no `app.config.*`; otherwise resolved from the effective Expo config when the preview publishes | The scheme the QR code opens. |

The teardown needs the repository secret `EXPO_TOKEN` and the repository variable
`EAS_PROJECT_ID`; without them it warns and leaves the channel. An app that keeps its own release
workflow takes only the previews with `genesis add template previews` (pr-preview, the teardown and
the fingerprint files). `genesis doctor` reports an app with no preview lane, or with channel
switching on only in development (rule `missed-value`).

## Cost

With EAS's trigger every merge is an EAS workflow run: the `source` job (an install and a
fingerprint) and an update job for a JavaScript-only merge, a build per platform for a native one.
With GitHub's trigger the lane moves the common case off EAS: a JavaScript-only merge runs one GitHub job (a few minutes
of runner time, no EAS build minutes, no queue), and EAS runs only for a native change, a merge
while a build is being made, or a merge while an EAS release run is open. A native change costs one
store build per platform, as before; a merge while EAS has a build queued but not started finds no
build record and builds again (a wasted build, nothing missed).

## Build cost

Every workflow run that builds or repacks uses EAS build minutes, and a pull request gets a new
run on each push. The templates start narrow; widen them in the app's copy when the plan allows.

| Workflow | Runs by default | Why | To widen it |
| --- | --- | --- | --- |
| `pr-preview.yml` | A pull request labeled `Preview`. With `release.previews.everyPullRequest`, also pull requests into `main` (and `release.previews.branches`) whose changes touch the app's code folder, `app.json`, `app.config.*`, `eas.json`, `package.json`, a lockfile or `release.paths`. One run per branch at a time. A JavaScript-only change is a fingerprint and an update (no build minutes); only a native change repacks or builds, Android only until iOS is on. | A docs-only pull request has nothing to install. An iOS preview build is an ad hoc build, which installs only on devices registered before it was built: with none, every iOS build job fails. | Add branches or paths under `on.pull_request`. Turn iOS preview builds on with `PREVIEW_IOS=true` in the `preview` EAS environment after `eas device:create`. |
| `e2e.yml` | Only by hand. | Maestro jobs need a paid EAS plan, and each run is a simulator build or repack. | Add the `pull_request` trigger in the file's header comment. |
| `deploy-production.yml` | Every push to `main` that changes the app (with `trigger: "github"`, only when `native-release.yml` starts it). | A store build only when native code changed; otherwise a fingerprint and an update. | Not needed. |
| `native-release.yml` | Only with `trigger: "github"`: every push to `main` that changes the app. | GitHub minutes; EAS only when it must. | Not needed. |
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
- EAS's trigger (the default since ADR 0026) renders and validates offline, and its `source` job's
  checks run in the tests on a real repository; it hasn't run on a live EAS project yet: watch the
  first merge after moving (the push should start `deploy-production.yml` on expo.dev).
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
keeps byte for byte (`__tests__/release.test.ts`). Copy a template with release markup only once
rendered with the app's own settings (`genesis add template release`; the starter's copy only
when the app's `release` is the default): a raw copy keeps its `#@if` blocks and tokens, and the
starter's has both platforms and the `production` names. An app copied by hand has no lock entries: `genesis add template <set>` adopts
them.

## Validating the workflows

`eas workflow:validate <file>` checks a file against EAS's schema and then on EAS's servers, so it
needs a login and a project id. Offline, the same schema checks can be run against the public
schema (`https://api.expo.dev/v2/workflows/schema`); that is how these templates were checked. The
server-side step wasn't run.
