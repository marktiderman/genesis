# ADR 0026: EAS Workflows owns the native release trigger

- Status: proposed
- Date: 2026-11-21
- Features: `eas-workflows`
- Related: docs/NATIVE-RELEASE.md, docs/FRAMEWORK.md Part 1

## Context

A Genesis native app's release lane started on GitHub Actions: `native-release.yml` ran on every
merge to `main`, published a JavaScript-only update itself, and started a dispatch-only
`deploy-production.yml` on EAS for everything else (a build, or an update on a build still being
made). GitHub was chosen for speed: its runners start in seconds, where an EAS job can queue.

A consumer app's GitHub Actions were blocked by billing. Every merge to `main` then started
nothing: `deploy-production.yml` had no trigger of its own, and nothing told anyone. The app's agent
proposed adding a push trigger to its copy of `deploy-production.yml`; beside `native-release.yml`
that is two owners of one merge, racing to publish the same release.

Expo's documented lane is the other way round: one EAS workflow, `on: push: branches: [main]`,
fingerprint, `get-build`, then a build and a submit when no build has the fingerprint, or an
update when one does ([Deploy to production](https://docs.expo.dev/eas/workflows/examples/deploy-to-production/),
[syntax: on.push, concurrency](https://docs.expo.dev/eas/workflows/syntax/),
[pre-packaged jobs: fingerprint, get-build, repack](https://docs.expo.dev/eas/workflows/pre-packaged-jobs/)).
EAS starts it through the GitHub app linked to the EAS project, with no GitHub Actions minutes. For
deploys Expo recommends a concurrency group without `cancel_in_progress`: the running deploy
finishes, and the newest waiting run replaces the ones in between. GitHub Actions is documented as
optional, for starting a workflow with `eas workflow:run` from an event EAS doesn't take.

`pnpm features find release` and `eas`: `eas-workflows` (this lane), `native-previews`,
`maestro-smoke`, `app-updates`. Nothing else owns a release trigger, so this extends
`eas-workflows` (G2), with no new package or primitive.

## Decision

1. **One trigger per app, chosen in config.** `genesis.config.json` `release.trigger` is `"eas"`
   (the default for new apps) or `"github"` (what an app with `native-release.yml` and no setting
   reads as). The templates render exactly one live trigger:
   - `"eas"`: `.eas/workflows/deploy-production.yml` runs `on.push` to `main` (paths: the app,
     `release.paths`, the root's install files under `appFolder`) and by hand. Its first job,
     `source`, checks `main` contains the commit and eas.json still matches, and computes each
     platform's runtime version with the build profile's env (`eas fingerprint:generate
     --build-profile`, or the `release.runtimeVersion` command). Per platform, `get-build`
     (`wait_for_in_progress`) then decides: an update on the build, or a build and a submit.
     Concurrency is Expo's deploy default (no `queue: max`): each run releases both platforms of
     the newest commit, which carries every older one. No GitHub release workflow is written.
   - `"github"`: today's lane, unchanged in behaviour: `native-release.yml` on GitHub Actions,
     `deploy-production.yml` dispatch-only with `queue: max`.
   Every later job reads the release from `source`'s outputs in both, so the two renders differ
   only in the trigger, `source` and concurrency (G6).
2. **Genesis owns the files; the app owns the choice.** The trigger, platforms, paths, profile,
   channel, Sentry and the hook are config. The templates stay in `templates/`, rendered by
   `genesis init`, `genesis add template release` and `genesis upgrade`. An app never edits a
   trigger into its copy (G1, G2).
3. **Moving is the app's choice, checked, and atomic.**
   - An upgrade never moves an app: it writes `"trigger": "github"` for an app on GitHub's lane
     that names none, and the doctor (`release-trigger-github`) names the move.
   - The move is `genesis add template release --trigger eas`, or `genesis upgrade` once the app
     sets `"eas"` itself. In one change it gives `deploy-production.yml` its push trigger and
     removes an unedited `native-release.yml`, or does neither. The upgrade's pull request stages
     the deletion.
   - It holds, saying what's left, until what replaces the GitHub lane is confirmed:
     - the EAS project's GitHub link, asked of Expo's GraphQL API (`app.byId.githubRepository`)
       with `EXPO_TOKEN` or the `eas login` session, since EAS's push trigger starts nothing
       without it;
     - with a release hook, `RELEASE_GITHUB_TOKEN` in `pushHook.secrets`.
   - It also holds for a `native-release.yml` with the app's edits that still runs on push (an
     edited one is never deleted), for another workflow that releases on push, and for a
     `deploy-production.yml` whose change waits in a `.genesis-next`.
   - `--replace` and `--replace-rival` are the ways out of the last three.
4. **The doctor checks the lane can run.** `release-lane-live` (new): an error when
   `deploy-production.yml` is dispatch-only and nothing live starts it (the failure above), a
   warning when the files are on the other trigger than `release.trigger`. `release-lane-twice`
   now also guards EAS's lane: a GitHub workflow releasing on push beside a push-triggered
   `deploy-production.yml` is an error.
5. **A failed release says so.** Expo Workflows sets a commit status for runs GitHub started, but
   emails nobody by default, so the
   workflow adds:
   - a `release_failed` job (`after` every job, `if: failure()`) that posts to a Slack-compatible
     webhook (`RELEASE_FAILURE_WEBHOOK`, an EAS secret) when one is set;
   - with `release.failureEmails`, an Expo `email` job.
   NATIVE-RELEASE.md, "When a release fails", says where to look.
6. **New apps** (`genesis init --template native`) get the EAS trigger and no
   `native-release.yml`; their first step is linking the repository to the EAS project.

## Glossary

- **Release trigger**: what starts a release when code merges to `main`; one per app,
  `release.trigger`. Not "release lane" (the whole set of release files) or "dispatcher".

## Alternatives

- **Flip every app to EAS's trigger on its next upgrade**: an app on GitHub's lane started EAS
  with `eas workflow:run`, which needs no GitHub link, so many never linked one. After a flip,
  every merge would start nothing, the same silent stop this ADR fixes, and no file shows the link.
  Rejected: the move is opt-in and checks the link online.
- **Add a push trigger to `deploy-production.yml` beside `native-release.yml`** (the consumer
  app's proposal): two owners of each merge. Their order checks narrow the race but fail open,
  so an older commit could land over a newer one, and every merge would run twice.
- **Keep GitHub as the only trigger, and alert on a blocked run**: still a single point of failure
  on GitHub Actions billing, and an alert doesn't ship the release.
- **GitHub fast path with an EAS fallback** (EAS triggers on push and skips when GitHub already
  published): two owners again, with the skip depending on timing; more code than either lane.
- **Remove the GitHub lane entirely**: it is still faster for JavaScript-only merges on EAS plans
  with long queues, and an app that wants that and has Actions can choose it. Kept as the
  `"github"` setting, not the default.

## Consequences

- An app on GitHub's trigger keeps it until it moves. Before moving it:
  - links the repository on expo.dev (the move checks the link);
  - puts `EXPO_TOKEN`, `SENTRY_AUTH_TOKEN` (with Sentry) and the hook's secrets in the EAS
    environment;
  - with a hook, adds `RELEASE_GITHUB_TOKEN`.

  docs/MIGRATION.md has the steps. This stays a minor of genesis-cli: nothing changes for an app
  until it chooses to move.
- JavaScript-only updates on EAS's trigger wait for an EAS worker (minutes on a paid plan's
  priority queue, longer on the free one) instead of a GitHub runner. The move's summary says so.
- A manual run releases only committed code at `main`'s tip. `source` refuses an uploaded folder,
  a dirty checkout, and, by hand, any commit but `main`'s latest. GitHub's lane's `--ref` and
  handoff gave the same guarantee.
- Smaller differences:
  - L1: on EAS a Sentry upload that failed is re-done by hand from the commit's export. GitHub kept
    the `dist` artifact 7 days for a re-run. Left as is: EAS keeps nothing a later run can rely on.
  - L2: the update's message is the commit subject, as on GitHub.
  - L3: `RELEASE_REPOSITORY` falls back to the checkout's `origin` on a manual run.
  - L4: `[eas skip]` is EAS's own push-skip marker (Expo's syntax and troubleshooting docs), so the
    workflow doesn't check it again.
- Previews run a pull request's own code on EAS before review, and the EAS trigger puts release
  secrets in the release's EAS environment. So previews:
  - run on the `Preview` label only (every pull request is the `release.previews.everyPullRequest`
    opt-in);
  - read an environment of their own (`release.previews.easEnvironment`, default
    `preview-release`) that holds the release's plain values and a preview `EXPO_TOKEN`;
  - get a doctor warning (`preview-environment`) when they read the release's.

  What's left: anyone who can push a branch can write a workflow there that names the release's
  environment, and EAS runs it, so write access stays with trusted people.
- `pr-preview-teardown.yml` still runs on GitHub Actions. With Actions blocked, a closed pull
  request's channel stays until it's deleted by hand; the phone heals by itself. Moving it to EAS
  is left for later.
- Not yet run on a live EAS project. The templates validate against EAS's workflow schema, and the
  `source` job's checks run in the tests. Watch the first merge after moving.
