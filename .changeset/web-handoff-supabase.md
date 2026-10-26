---
"@marktiderman/genesis-supabase": minor
---

Continue on the web, already signed in (the web-handoff block). Features: web-handoff

- `/web-handoff/server`: `createWebHandoff({ admin, webOrigin?, ttlSeconds?, continueSeconds?, rateLimit?, log? })` returns three POST routes. `mint` verifies the bearer with `auth.getUser` and records a single-use, 60-second handoff for that account only, from that app session. `redeem` takes the page's `claim` (once, unexpired; returns whose link it is and a 30-second continue nonce, and mints nothing), `continue` (the nonce, once, in time, not after Cancel: only then `auth.admin.generateLink` for the person's own email), `discard` (Cancel) and `bind` (the new web session's id, from its verified access token). `signOut` ends exactly the web sessions handed off from the calling app session. The steps are also exported (`mintWebHandoff`, `claimWebHandoff`, `continueWebHandoff`, `discardWebHandoff`, `bindWebHandoffSession`, `signOutWebHandoffs`). Each step is logged (person, path, time), never a token or nonce.
- `/web-handoff`: `takeWebHandoffFragment` reads `#t=…&next=…` and drops it from history at once; `completeWebHandoff` checks who is signed in with `auth.getUser`, claims the link, and asks "Continue as {email}?" unless the browser is already that person. `continue()` signs a different person out locally, then exchanges the token with `verifyOtp({ token_hash, type: "email" })`; `cancel()` burns the nonce and signs anyone else out locally.
- `appRelativePath`: the one destination check (no `//host`, `/\host`, schemes, whitespace or control characters, or their percent-encoded forms), run before minting and after sign-in.
- `migrations/0015_genesis_web_handoff.sql` (and its pgTAP test): `private.genesis_web_handoffs` with digests only; issue (rate-limited per person under a lock), claim, continue, discard, bind and revoke functions, service_role only.
