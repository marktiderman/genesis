---
"@marktiderman/genesis-core": minor
---

`createOrAdopt` takes `final(existing)`: a row already there that's finished (a sent answer) comes back with `final: true` and is never merged into. The result now always carries `final`.
