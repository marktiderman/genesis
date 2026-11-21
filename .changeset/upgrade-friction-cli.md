---
"@marktiderman/genesis-cli": patch
---

Upgrade friction from taking the last release:

- `genesis upgrade` and `genesis add` run the app's own `features:build` script when it has one
  that isn't `genesis features build`, so features.json (and the rest) come out exactly as the
  app's own build and check write them, instead of in another order.
- `genesis agents`, the catalog and the doctor leave out a deprecated package (a renamed one's
  alias, `"deprecated"` in its package.json) that the app's package.json no longer lists, though
  its folder is still in node_modules after the upgrade.
- `migration-drift` no longer reports a copy that differs from its package migration only in SQL
  comments (`--`, `/* */`, outside strings and dollar-quoted bodies) and whitespace: it makes the
  same database, so there is nothing for a forward migration to carry. A real SQL change still drifts.
- The README's upgrade section says what to do when `npx @marktiderman/genesis-cli@<v>` stops with
  `EOVERRIDE` in an app (the app's npm override against its own direct dependency): run the app's
  installed `genesis`, or write the override as `"$zod"`.
