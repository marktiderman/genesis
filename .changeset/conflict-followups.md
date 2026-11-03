---
"@marktiderman/genesis-core": patch
"@marktiderman/genesis-ui": patch
---

A form that stays open after a save checks its next save against the version that save left, instead of reporting its own save as someone else's change. A conflict that comes back after `ResourceForm` closed (a route change during the undo delay) is toasted, since no sheet is left to show it.
