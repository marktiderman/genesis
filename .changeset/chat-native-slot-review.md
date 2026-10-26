---
"@marktiderman/genesis-chat": minor
---

Native attachment slot, after review:
- A slot that threw tries again once its attachment, message, kind or slot changes (`ChatErrorBoundary resetKeys`), instead of keeping the card for the row's life.
- A slot that returns null draws nothing for that attachment and leaves the bubble's label and VoiceOver actions; a message left with nothing to show (also one that is only an unregistered kind under `slots={{ attachment: null }}`) is not drawn or read.
- The slot's `url` is http(s) only, else null (`slotUrl`).
- A card action still running after 30 seconds stops being busy and reads `cardActionTimedOut`; `cardActionTimeoutMs` on `ChatThreadScreen` and `MessageBubble` changes it (0 for never).
- A voice note's transcript folds behind "Show more" by its measured line count (an unclamped copy laid out out of sight), not its length.
