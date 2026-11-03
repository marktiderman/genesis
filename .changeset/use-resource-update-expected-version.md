---
"@marktiderman/genesis-core": minor
"@marktiderman/genesis-ui": patch
---

`useResource`'s `update(id, data, { expectedVersion })` (`UpdateOptions`) checks a write against the version given instead of the cached row's: "keep mine" after a conflict, at `WriteConflict.currentVersion`. It goes through the resource's write path like any update, so its committed version is what the next change of the row is checked against.

ResourceView's board sends "Keep my version" this way. Before, it called the provider directly, and a move made right after it came back as a false conflict against the save it had just made. A "keep mine" save that changed no row now shows as a refusal in the sheet. The board's edge fades work right to left, and a board on another surface sets `--board-edge` to match it.

Features: resource-view-board, data-offline
