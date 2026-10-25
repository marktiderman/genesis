---
"@marktiderman/genesis-chat": patch
---

Native renderer:
- `useChatThreadStackOptions` (and `chatThreadStackOptions`): the thread's header with an opaque bar. On iOS 26 and later a see-through bar draws its scroll edge effect over the inverted list and the whole thread renders blurred once it reaches the bar. `ChatThreadScreen` now measures its own top for the keyboard offset when none is given.
- Voice notes draw as many bars as fit (`barsThatFit`), so the waveform never runs under the time and speed.
- On the #241 APIs: `PendingMessage.files`, `accessLoading`, `canPin`, `reattach` ("Attach again" on a message whose files were lost), `usePeople` (`ChatPeopleScope`), and `randomId` as `createTusUpload`'s default id. `MessageActionContext.direct` is now `canPin`.
