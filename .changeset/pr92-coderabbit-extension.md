---
"@marktiderman/genesis-extension": patch
---

Surfaces: each open's secret is stored under a key of its own (`genesis-extension:surface:<tab>:<nonce>`), and confirming a frame removes only that key, so a reopen's secret minted meanwhile is never deleted. A new open clears the tab's earlier secrets.
