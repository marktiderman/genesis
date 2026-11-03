---
"@marktiderman/genesis-cli": minor
---

A block's migration can declare `runsBefore` (another block's migration that reads what it creates). When both are new in the same `genesis add`, `migrate` or `upgrade` run, it's copied first, with its package's earlier migrations, so it gets the earlier timestamp. A migration's `needs` is no longer satisfied by a function definition inside a SQL comment.
