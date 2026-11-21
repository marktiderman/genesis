---
"@marktiderman/genesis-cli": minor
---

The native release lane now starts on EAS Workflows (ADR 0026). `deploy-production.yml` runs on
every push to main by its own trigger, as Expo documents it: it finds each platform's runtime
version, then publishes an update on a matching store build or builds and submits. GitHub Actions
no longer takes part, so a blocked or unpaid Actions account can't stop a release.

- New `release.trigger` in genesis.config.json: `"eas"` (the default) or `"github"` (the previous
  lane: `native-release.yml` on GitHub Actions, `deploy-production.yml` dispatch-only). Only one is
  ever written.
- `genesis upgrade` and `genesis add template release` move an app on GitHub's trigger to EAS's in
  one change: `deploy-production.yml` takes the push and an unedited `native-release.yml` is removed
  (the upgrade's pull request stages the deletion), or neither happens and the summary says why.
  Before merging, connect the repository to the EAS project and put `EXPO_TOKEN` (and
  `SENTRY_AUTH_TOKEN`, the hook's secrets) in the EAS environment. To stay on GitHub, set
  `"release": { "trigger": "github" }`.
- `genesis init --template native` writes no `native-release.yml`.
- New doctor rule `release-lane-live`: an error when `deploy-production.yml` is dispatch-only and
  nothing starts it, a warning when the files don't match `release.trigger`. `release-lane-twice`
  also guards EAS's lane.
