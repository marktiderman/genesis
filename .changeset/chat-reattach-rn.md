---
"@marktiderman/genesis-chat": patch
---

`reattach` fills only the lost file slots and keeps the files that survived a relaunch, and the saved queue keeps track of which slot was lost. The package exports its source under the `react-native` condition (as genesis-ui-native does), so Metro picks up edits without a build.
