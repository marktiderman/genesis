---
"@marktiderman/genesis-cli": patch
---

`genesis doctor`: an `=` comparator in a range now intersects its other bounds instead of replacing them, so a contradictory range such as `>=0.88.2 =0.88.1` is empty in either order and an `expo.install.exclude` entry can't suppress a required error through it.
