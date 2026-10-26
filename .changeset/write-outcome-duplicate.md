---
"@marktiderman/genesis-core": minor
"@marktiderman/genesis-studio-server": patch
---

A unique violation (`23505`) is now its own write outcome, `duplicate`, instead of `invalid`. A caller that keeps one live row per key (a draft, a natural-key upsert) can adopt the existing row; `fields` and the safe message are unchanged. Studio server answers it with 409.
