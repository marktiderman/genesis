---
"@marktiderman/genesis-cli": minor
---

New native apps release on EAS Workflows' own trigger (ADR 0026). `deploy-production.yml` runs on
every push to main, as Expo documents it: it finds each platform's runtime version, then publishes
an update on a matching store build or builds and submits. GitHub Actions takes no part, so a
blocked or unpaid Actions account can't stop a release. Apps already on GitHub's trigger keep it
until they choose to move (docs/MIGRATION.md).

- New `release.trigger` in genesis.config.json: `"eas"` or `"github"` (the previous lane:
  `native-release.yml` on GitHub Actions, `deploy-production.yml` dispatch-only). Only one is ever
  written. Unset, an app with `native-release.yml` reads as `"github"`, and `genesis upgrade`
  writes it down; nothing about its releases changes.
- `genesis add template release --trigger eas` moves an app in one change: `deploy-production.yml`
  takes the push and an unedited `native-release.yml` is removed. It first checks the EAS
  project's GitHub link on Expo's API, and, with a release hook, that `RELEASE_GITHUB_TOKEN` (an
  EAS secret) is in `pushHook.secrets`. Until both hold, nothing moves and it says what's left.
- PR previews run when someone adds the `Preview` label (every pull request is the new
  `release.previews.everyPullRequest` opt-in), in an EAS environment of their own
  (`release.previews.easEnvironment`, default `preview-release`) rather than the release's: a
  preview runs the pull request's code before review. New doctor rule `preview-environment`.
  Create that environment (the release's plain values, a robot EXPO_TOKEN) before upgrading.
- A failed release says so: a `release_failed` job posts to `RELEASE_FAILURE_WEBHOOK` (an EAS
  secret) when set, and new `release.failureEmails` adds an Expo email job.
- A run started by hand releases only committed code at main's tip. Updates carry the commit
  subject as their message.
- `genesis init --template native` writes no `native-release.yml`.
- New doctor rules: `release-lane-live` (an error when `deploy-production.yml` is dispatch-only and
  nothing starts it, a warning when the files don't match `release.trigger`) and
  `release-trigger-github` (a warning naming the move). `release-lane-twice` also guards EAS's
  lane.
