---
"@marktiderman/genesis-connect": patch
---

The callback no longer waits on the best-effort revoke of a grant it turns down: the revoke runs in the background, bounded to 3 seconds, and can't leak an unhandled rejection. Documents that a `store` that throws leaves its refresh token unrevoked, and adds tests for look-alike localhost token URLs and for non-string ID token audiences.
