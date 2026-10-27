---
"@marktiderman/genesis-studio-server": minor
---

Export the identity switch for an app's own API: `switchToUser` runs inside any transaction (postgres.js, or Drizzle's `sql` with `tx.execute`). It sets the role, the JWT claims and an allow-listed `request.headers` (credential headers refused), then checks `current_user`. `jwtVerifier` and `supabaseVerifier` verify a raw token, such as a socket handshake's. The studio handler now uses the same switch, and also clears `request.headers` on every transaction.
