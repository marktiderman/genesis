---
"@marktiderman/genesis-supabase": patch
---

New package, `@marktiderman/genesis-supabase`: `createGenesisSupabase` (PKCE sign-in, a persisted session that refreshes itself, the storage you pass) and `must()`; on `/native`, `keychainStorage` (chunked Keychain storage whose writes switch over only when complete and run one at a time per key), `refreshWhileActive` and `wipeSessionOnReinstall`. It imports neither React Native nor Expo.

Features: supabase-kit
