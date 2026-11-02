---
"@marktiderman/genesis-cli": patch
---

`genesis upgrade` (and the genesis-upgrade workflow) now keeps pnpm's `minimumReleaseAgeExclude` as exact versions, not a pattern. 1.17.3 collapsed every Genesis pin to `'@marktiderman/genesis-*'`, which exempts every future Genesis release from the release-age wait, so a compromised publish would reach apps at once. The tidy now merges each Genesis package's pins into one entry listing its exact versions (`'@marktiderman/genesis-features@0.8.0 || 0.8.1'`, which pnpm 11.1.3's frozen install honours, unlike two entries for one package), and drops versions the lockfile no longer holds. A pattern the app wrote itself is left alone. Also:

- With `minimumReleaseAge` set, pnpm's strict mode fails the install with `ERR_PNPM_NO_MATURE_MATCHING_VERSION`; the upgrade now says why and what to do (add the versions as exact excludes, or wait), and never loosens the setting.
- The pnpm-workspace.yaml search stops at the repository's top level, so a file outside the repository is never rewritten or committed by `--pr`.
- `genesis upgrade --version <v>` reaches the upgrade instead of printing the CLI's version.
- The workflow's pull request job checks out with `persist-credentials: false`; only its last step has the write token, for the push and `gh`.
