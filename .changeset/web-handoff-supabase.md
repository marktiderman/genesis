---
"@marktiderman/genesis-supabase": minor
---

Continue on the web, already signed in (the web-handoff block). Features: web-handoff

- `/web-handoff/server`: `createWebHandoff({ admin, webOrigin?, ttlSeconds?, rateLimit?, log? })` returns two POST routes. `mint` verifies the bearer with `auth.getUser` and records a single-use, 60-second handoff for that account only; `redeem` marks it used and only then mints Supabase's sign-in token for the person's own email with `auth.admin.generateLink`. `mintWebHandoff` and `redeemWebHandoff` are the same steps for callers that verify the person another way. Each handoff is logged (person, path, time), never its token.
- `/web-handoff`: `takeWebHandoffFragment` reads `#t=…&next=…` and drops it from history at once; `completeWebHandoff` redeems it and asks "Continue as {email}?" unless the browser is already that person, signs a different person out locally only after Continue, and exchanges the token with `verifyOtp({ token_hash, type: "email" })`.
- `appRelativePath`: the one destination check (no `//host`, `/\host`, schemes, whitespace or control characters, or their percent-encoded forms), run before minting and after sign-in.
- `migrations/0015_genesis_web_handoff.sql` (and its pgTAP test): `private.genesis_web_handoffs`, a SHA-256 digest per link, never the token; `genesis_web_handoff_issue` (rate-limited per person under a lock) and `genesis_web_handoff_redeem`, service_role only.
