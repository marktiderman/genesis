---
"@marktiderman/genesis-ui-native": minor
---

NativeThreadList: `jumpId`, the id `jumpTo` names a row by when that isn't the row's key. A message keyed by the id the phone gave it (so it keeps its row when the server's copy lands) can now be gone to by the server's id; return `null` for a row that can't be gone to. `keyExtractor` stays the default.

Fixed: on FlatList (no FlashList module), going to a row scrolled straight back to the bottom. The jump's own scroll starts at the bottom, so its first scroll events read as "at the bottom", which turned following back on. The list now ignores its own scroll events until it settles, each try at the row restarts that, and the check for "landed at the bottom" waits until then.
