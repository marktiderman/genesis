---
"@marktiderman/genesis-features": minor
---

`PackageMeta` gains `owner`, a GitHub handle or team (`@octocat`, `@acme/web`) who reviews changes to the package; `readPackageMeta` checks its shape. Genesis's packages each declare one, and the repo's `.github/CODEOWNERS` is generated from them (`pnpm gen:codeowners`, checked in CI), so ownership can split per package later without a process change.
