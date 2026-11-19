---
"@marktiderman/genesis-chat": patch
"@marktiderman/genesis-native": patch
"@marktiderman/genesis-notifications": patch
"@marktiderman/genesis-product": patch
"@marktiderman/genesis-sites": patch
"@marktiderman/genesis-supabase": patch
"@marktiderman/genesis-support": patch
"@marktiderman/genesis": patch
---

Depends on `@marktiderman/genesis-config` (the new name of `@marktiderman/genesis-features`)
instead of genesis-features. No change to what the package exports. `@marktiderman/genesis/features`
now re-exports genesis-config.
