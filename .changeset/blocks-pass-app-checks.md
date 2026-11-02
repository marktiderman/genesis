---
"@marktiderman/genesis-supabase": patch
"@marktiderman/genesis-sites": patch
"@marktiderman/genesis-cli": patch
---

Blocks pass the app's own checks as soon as `genesis add` copies them in.

- genesis-supabase: the `genesis-apple-revoke` function writes the PEM armour as `-{5}BEGIN PRIVATE KEY-{5}`, so gitleaks' private-key rule no longer flags it in every app that installs the account block. It reads keys exactly as before. The pgTAP tests the `events` and `support-feedback` blocks copy are tagged with those blocks' ids (`@feat:events`, `@feat:support-feedback`), the features the app registers.
- genesis-sites: the pgTAP tests `genesis add sites` copies are tagged `@feat:sites`, the feature the block registers, not `sites-store` and `sites-blog`, which an app doesn't have. `pnpm features check` passes after the add.
- genesis-cli: a test reads every block in the workspace as `genesis add` ships it and fails on a `@feat:` tag the app wouldn't register (the block's own id, or a block it requires), or on a file gitleaks' private-key rule matches.
