---
"@marktiderman/genesis-ui": patch
"@marktiderman/genesis-ui-native": patch
"@marktiderman/genesis-switchboard": patch
"@marktiderman/genesis": patch
---

Republish with a real semver range where 2.1.0 (and equivalents) shipped a
literal `workspace:` protocol string in `dependencies`/`peerDependencies`.

`@marktiderman/genesis-ui@2.1.0`, `@marktiderman/genesis-ui-native@2.0.2`,
`@marktiderman/genesis-switchboard@2.0.1` and `@marktiderman/genesis@0.5.2`
were all published on 2026-09-10 with an unresolvable dependency —
`"@marktiderman/genesis-core": "workspace:^"` (or `workspace:*` for the
umbrella package) — because that release reached npm through a path outside
this repo's pnpm-aware publish pipeline (see the release.yml history: every
CI publish attempt for these packages failed the OIDC Trusted Publisher
exchange with 404, so nothing here actually published them). No consumer
can install any of these four versions.

This changeset carries no code change — it exists purely to force a patch
release once the publish pipeline is fixed (this PR) and npm's Trusted
Publisher is configured for the remaining packages (an npmjs.com-side
action, not a repo change), so `2.1.1` / `2.0.3` / `2.0.2` / `0.5.3` land
with a real, installable dependency range.
