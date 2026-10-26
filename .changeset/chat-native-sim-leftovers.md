---
"@marktiderman/genesis-chat": patch
"@marktiderman/genesis-ui-native": patch
---

Chat on native, from a simulator check: a video pauses when the app goes to the background and when it unmounts, and `ChatThreadScreen focused={false}` (the navigator's `useIsFocused()`) pauses what the thread is playing, since a tab switch keeps it mounted (`pauseChatPlayback`). Each scheduled row's Cancel names its message. The long-press sheet's caption has room under the sheet's top edge and names an app card by its kind's title, as the inbox preview now does (`attachmentPreview`). A newly added topic's chip scrolls into view. The topic and schedule sheets fit their content. A closed topic with no messages says it is closed. App attachment kinds get `{ mine }` as a second argument (`ChatCardContext`), so the sender's card can drop its button.

genesis-ui-native: `NativeSheet fitContent`, a sheet as tall as its content (on iOS a bottom panel over a scrim, kept above the keyboard; under `NativeSheetProvider`, the library's dynamic sizing).
