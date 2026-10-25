---
"@marktiderman/genesis-cli": minor
---

`withGenesis()` gives each `APP_VARIANT` its own URL scheme: `development` appends `-dev` and `preview` appends `-preview` to every `scheme` (production keeps the base), so builds installed side by side no longer register the same scheme and a `scheme://` link opens the build it names. `VariantSuffix` gains `scheme`; change it with `variants: { development: { scheme: "-debug" } }`. An app that matches incoming links against its scheme should accept each variant's, as the starter's `src/lib/links.ts` now does.

**Migrating:** a development or preview build no longer answers to the base scheme. Add `myapp-dev://…` and `myapp-preview://…` wherever the base scheme's redirect URLs are allowed (Supabase Auth's redirect URLs, OAuth clients, a Google sign-in callback), or keep the old behaviour with `variants: { development: { scheme: "" }, preview: { scheme: "" } }`.

Features: expo-config-plugin
