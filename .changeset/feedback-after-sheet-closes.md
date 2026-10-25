---
"@marktiderman/genesis-native": patch
"@marktiderman/genesis-support": patch
---

Send feedback from the devtools overlay captures the screen once the overlay's sheet has finished closing, not after a fixed 400 ms that sometimes caught it half way down. The devtools block's `close()` (and the `devtoolsFeedback` slot's `close`) now returns a promise that resolves on the sheet's `onDismiss` (or after 800 ms where the platform doesn't report it); the sheet stays mounted while it slides away. The support block's slot waits for it, and still waits 400 ms for an overlay whose `close` returns nothing.

Features: devtools-overlay, support-feedback
