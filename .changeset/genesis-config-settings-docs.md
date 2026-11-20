---
"@marktiderman/genesis-config": patch
"@marktiderman/genesis-supabase": patch
"@marktiderman/genesis-cli": patch
---

Docs: two settings linked to one feature switch it off when either is false; the settings results
have no prototype, so read them directly or with `Object.prototype.hasOwnProperty.call` (their own
`hasOwnProperty` throws); a direct database login counts as server code for Genesis settings; and
`GENESIS_CONFIG_KEYS` is kept by hand, so a new top-level genesis.config.json key is added there.
