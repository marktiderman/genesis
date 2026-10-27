---
"@marktiderman/genesis-studio-server": patch
---

A database login that wasn't granted the role it switches to now fails with `IdentitySwitchError` ("the database login can't switch to it … grant authenticated to <login>"), with the database's 42501 as its `cause`, in both `switchToUser` and the studio handler. Before, `set_config('role', …)` ran outside the switch's error handling, so it surfaced as a bare 42501 that read as the caller lacking a permission. Other database errors during the switch (a missing role, a lost connection) still pass through unchanged.
