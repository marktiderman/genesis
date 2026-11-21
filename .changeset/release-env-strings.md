---
"@marktiderman/genesis-cli": patch
---

With `release.trigger` `"github"`, `deploy-production.yml` failed in its first job because EAS
Workflows refuses a non-string `env` value: `RELEASE_IOS` and `RELEASE_ANDROID` now take the
`ios` and `android` inputs' own text, which the step already compares as text.
