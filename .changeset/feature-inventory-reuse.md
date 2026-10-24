---
"@marktiderman/genesis-features": minor
"@marktiderman/genesis-cli": minor
---

The feature registry becomes a reuse catalog. A new first status, `idea`, captures work that is not agreed yet so `find` turns it up before anyone builds the same thing twice. Optional fields describe what a feature is and how to reuse it: `layer`, `platforms` (status per platform), `entry` (what to import), `keywords`, `slots`, `extends` (a variant of another feature), `requires` and `contributes`. `defineFeatures` checks that `extends` and `requires` name real features, finds cycles, and refuses a beta or live feature that requires an idea, a planned or a retired one. `findFeatures` matches keywords, imports, slots and contributions and takes `platform`, `layer` and `status` filters; `genesis features find` gains `--platform`, `--layer` and `--status`, and the generated skill teaches reuse, then extend, then invent.

Features: feature-registry
