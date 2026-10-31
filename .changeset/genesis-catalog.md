---
"@marktiderman/genesis-cli": minor
---

`genesis catalog` prints the need→use catalog (what to use for each need, its import and docs) from the installed packages' declarations; `genesis primitives` still works, with a deprecation note, and its JSON keeps the `primitives` key until the next major (`genesis catalog --json` uses `catalog`). A package's `genesis.doctor` declaration may now call its list `catalog`; `primitives` is read as its old name until the next major, and a declaration with both is refused. Genesis's own packages keep `primitives` for now, so apps on an older genesis-cli still read them.

The agent guide `genesis agents` writes now says `genesis catalog`, so an app's `genesis agents --check` reports it stale once after upgrading: run `genesis agents` and commit the result.
