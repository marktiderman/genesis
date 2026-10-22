# @marktiderman/genesis-extension

## 0.1.1

### Patch Changes

- 0156f89: The top bar starts as one 32px row with a light shadow, and `autoResize` reports the body's height, so a bar shrinks as well as grows. The small window `openSurface` falls back to carries the open's secret, and `surface.ready` is false for a `?tab=` window opened without it.
- 0156f89: Surfaces: a frame confirming its open secret only removes it if it still holds that secret (re-read, under a Web Lock where shared), so a reopen's new secret is never deleted. The floating panel's host lets the page's clicks through (`pointer-events: none`) until the surface is confirmed.
- 0156f89: Surfaces: each open's secret is stored under a key of its own (`genesis-extension:surface:<tab>:<nonce>`), and confirming a frame removes only that key, so a reopen's secret minted meanwhile is never deleted. A new open clears the tab's earlier secrets.
