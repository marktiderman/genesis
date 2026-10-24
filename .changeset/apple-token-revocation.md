---
"@marktiderman/genesis-supabase": minor
---

Sign in with Apple token revocation on account deletion (App Store Review Guideline 5.1.1(v)). The package now ships `functions/genesis-apple-revoke/`, a Supabase Edge Function template (Deno) that exchanges a sign-in's authorization code at Apple's `/auth/token` with an ES256 client secret signed from `APPLE_TEAM_ID`, `APPLE_KEY_ID` and `APPLE_PRIVATE_KEY`, checks the code belongs to the caller's Apple identity, and keeps the refresh token server-side; and `migrations/0003_genesis_apple_token_revocation.sql` (private token and queue tables, a `before delete` trigger on `auth.users` that queues a login's tokens in the delete's transaction, and four `public` functions executable by `service_role` only) with a pgTAP test. The function revokes queued tokens at `/auth/revoke`, retrying with backoff; deletion never waits for Apple. `storeAppleToken(client, { authorizationCode, clientId })` sends the code after sign-in, and `deleteMyAccount(client, { revokeAppleTokens: true })` asks for the revocation straight after the delete. Neither throws on a revocation failure.

Features: apple-token-revocation
