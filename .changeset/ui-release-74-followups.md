---
"@marktiderman/genesis-ui": patch
---

ResourcePage: column `width`, `minWidth` and `defaultVisible` now work when the page fetches its own rows (`resource=`), not only with `data`. `gen-exports.mjs` keeps the `./router/react-router` and `./router/tanstack-router` subpaths on regeneration and gains a `--check` mode.
