---
"@marktiderman/genesis-cli": minor
---

The `genesis` command now runs on commander 15, which needs Node.js 22.12 or newer (the package declares `engines.node: >=22.12.0`; Node 20 reached end of life in April 2026). Every command, option and default is unchanged. One behaviour from commander 13: a command given more positional arguments than it takes now stops with "too many arguments" instead of ignoring them.
