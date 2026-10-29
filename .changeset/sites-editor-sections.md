---
"@marktiderman/genesis-sites": patch
---

The site editor no longer crashes in a production build with "Could not find component config for footer". The section registry's registrations are split into shared chunks, which `sideEffects` didn't list, so a bundler dropped those it saw no use for (the footer among them). The chunks are now marked as having side effects.
