---
"@marktiderman/genesis-cli": patch
---

`genesis figma:routes` (and the `figma-routes` doctor rule): a page named in the `figma` config that the file doesn't have now counts as missing, so `--strict` fails even with no routes; each Figma API request gives up after 30 seconds with a clear error instead of hanging `doctor`; an Expo catch-all `[...rest]` matches one or more segments; template-literal and `{ pathname }` navigation in a route file is listed as not checked (`info`) instead of passing silently; and invalid JSON in genesis.config.json is a clear error naming the file. The README says which findings `--strict` ignores by design.
