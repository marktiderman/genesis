---
"@marktiderman/genesis-cli": patch
---

Templates: the release comment in each `templates/ci` workflow and `templates/vercel/ignore-build.sh` now asks for the release tag at the pinned commit, which isn't always `@marktiderman/genesis@X.Y.Z`. A release that bumps only other packages has no umbrella tag (docs/APP-CI.md, "Which ref to call").
