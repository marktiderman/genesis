---
"@marktiderman/genesis-supabase": patch
---

From review: `keychainStorage` splits between characters (an emoji at a chunk boundary was corrupted) and counts UTF-8 bytes against `chunkSize`; a pending marker lets the next write or remove sweep chunks left by a write that was cut short. `must()` throws `SupabaseQueryError` with the database's `code`, `details` and `hint` (and the error as `cause`), and keeps `null` in its return type for `.maybeSingle()`. `wipeSessionOnReinstall` also removes the PKCE code verifier and the stored user. `createGenesisSupabase({ platform: "native" })` sets the native defaults. The supabase-js peer range is the tested `^2.118.0`.
