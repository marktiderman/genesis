---
"@marktiderman/genesis-studio-server": patch
---

Harden `switchToUser`:
- It switches only to `authenticated` or `anon` unless `allowRoles` lists others, and it refuses a token whose `role` claim names a different role.
- A check in SQL now aborts the transaction when the switch didn't take, when the role bypasses RLS, or when the login is a superuser or BYPASSRLS (`allowPrivilegedLogin` is for local development).
- A statement timeout below 1 ms is refused.
- More credential-like header names are refused.
- `request.method`, `request.path` and `request.cookies` are cleared on every switch.
