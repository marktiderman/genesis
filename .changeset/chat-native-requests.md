---
"@marktiderman/genesis-chat": patch
---

What the native renderer needed from the core and hooks:
- Client ids no longer need `crypto.randomUUID`: `randomId()` falls back to `getRandomValues`. `createOutbox` and `ChatProvider` take a `newId`.
- A pending message carries its files' details (`PendingMessage.files`: name, type, kind, meta), so a pending voice note shows its duration.
- A file held as bytes (a pasted image, a recording) survives a relaunch when the app passes `persistFile`. Without it, the message waits for the file to be attached again (`reattach`) and is never sent without it.
- `useConversation` adds `accessLoading`, the kind's rules (`kind`) and `canPin`.
- `useMessageActions` returns stable callbacks.
- `ChatProvider` takes `loadPeople` for `usePeople` and `usePerson` (names and avatars, batched).
- Push from `createExpoDeliver` uses the `messages` category, and its data carries the message `seq`.
