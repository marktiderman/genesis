---
"@marktiderman/genesis-cli": minor
"@marktiderman/genesis-notifications": patch
---

First-run fixes from a fresh `genesis init --template native`:

- `genesis.lock.json` remembers where each package migration was copied (`migrations`), written by `genesis add`, `genesis migrate` and `init --template native`; a run on an older lock records the copies it finds. A copy the app deleted is reported as `deleted` by `genesis migrate` and `genesis add`, the way an edited copy is, and is never copied again (before, it looked new and `genesis upgrade` listed it to copy back). It doesn't make `genesis migrate` exit 1.
- An Edge Function's `npm:@marktiderman/genesis-*@<range>` imports are pinned to the versions the app has installed when `genesis add` copies the function, and `genesis upgrade` refreshes them the same way. The notifications function's own imports now name `^0.3.0`, not `^0.1.0`.
- The native starter's Metro test (which reads the monorepo's `metro.config.js`) runs only inside the Genesis monorepo, so `vitest` passes right after `init --template native`.
