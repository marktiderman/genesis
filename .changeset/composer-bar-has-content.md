---
"@marktiderman/genesis-ui-native": minor
"@marktiderman/genesis-chat": minor
---

`NativeComposerBar`'s `empty` is now `hasContent`, with the opposite sense: pass `hasContent` when attachments are waiting and no text is needed (it was `empty={false}`). No alias: `empty` shipped one release ago and nothing uses it. The bar's other props from that release now have tests.

genesis-chat's native `ChatComposer` now sits on `NativeComposerBar`, with the same props and test ids, so it takes the bar's sizes (a 44pt input) and press feedback. Its schedule action on Send is named `schedule` instead of `longpress`, with a new `scheduleHoldHint` in the copy. An app that gave haptics to both Genesis and chat gets one tap on send. Chat now needs genesis-ui-native 3.8.0.
