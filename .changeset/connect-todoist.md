---
"@marktiderman/genesis-connect": minor
---

Todoist, and refresh tokens shared across server instances. `todoistProvider` and `TODOIST_SCOPES` connect a Todoist account (comma-joined scopes, rotating refresh tokens, RFC 7009 revoke with HTTP Basic client auth through the new provider field `revokeAuth`). `accessToken` takes `grant` (`SharedGrant`: `lock`, `current`, and optional `readAccessToken` and `writeAccessToken`), so instances refresh one at a time from the grant's current refresh token, store the rotated token before the lock is let go, and share the access token sealed to `<aad>:access`. A provider that rotates no longer risks a used refresh token being sent again by another instance (Todoist revokes every token of the grant when that happens). New `verifyWebhookSignature` (also on `/webhooks`) checks a delivery's HMAC on its raw body in constant time.
