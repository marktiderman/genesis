---
"@marktiderman/genesis-chat": patch
---

Native team requests for chat's core, react, web and server:

- A hosted video joins the outbox at start: a `LocalFile` marked `hosted` goes through the outbox's `hostedUpload` (`ChatProvider hostedUpload`, or `hostedUploadFrom(videoUpload)` by default), the message is sent at once in order with the attachment pending, and the upload is saved with it, so a relaunch carries it on (`resume`) and re-sends with the same clientId. The web video recorder uses it.
- Upload progress: `client.upload(..., { onProgress, signal })` (XMLHttpRequest to a signed upload URL where there is one), passed to the `upload` hook too, shown as `PendingMessage.files[i].progress` and a bar on web pending bubbles.
- `fakeVideoProvider()` in `/server`: a dev-only `VideoProvider` with a mountable upload handler and `markReady`, refusing `NODE_ENV=production` unless forced.
- `useScheduled().schedule` takes native file URIs and the provider's `upload` hook, as `send` does.
- Search hits carry `threadRootId` (`genesis_chat.search_messages` returns `thread_root_id`; migration 0003), and the web thread opens a reply's thread.
- A failed scheduled message can be removed: the memory client matches `cancel_scheduled`, and the web scheduled list offers Remove.
