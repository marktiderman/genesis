---
"@marktiderman/genesis-core": minor
---

`live` reads resync on an interval while the page is visible (`resyncMs`, default 60s; 0 turns it off). Realtime checks each change against the row's new state, so a row the viewer can no longer read (binned, made a draft, moved) sends them nothing; the resync removes it.
