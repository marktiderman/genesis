---
"@marktiderman/genesis-cli": patch
---

The release lane leaves a platform out of a run while its eas.json `submit` block (resolved along `extends`) still has a template placeholder, instead of stopping the whole run: no runtime job, build, submit or update for that platform, with a warning on the run, and the other platform goes on. An app releasing iOS and Android before its Google Play key is in keeps its iOS releases and updates. `prove-ios.mjs` reads a `[api]` table with a comment after its header.
