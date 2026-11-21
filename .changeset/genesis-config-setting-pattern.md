---
"@marktiderman/genesis-config": minor
---

Settings: a string key takes `pattern`, the shape its value must have (a regular expression's source, anchored with `^` and `$`). `defineSettings` refuses a pattern on another type, one that isn't anchored, one that doesn't compile, syntax Postgres can't compile (a repetition bound over 255, named groups, lookbehind, `\k<…>`, `\u{…}`), or a default that doesn't match; `settingValueProblem` and `resolveSettings` refuse a value that doesn't match in every layer, matching the whole value (`^(?:pattern)$`, so `^foo|bar$` takes `foo` or `bar` only) (a `type` problem: the layer below applies); `catalogueManifest` writes it and `catalogueFromManifest` reads it back, so the in-app Settings screen checks it too.
