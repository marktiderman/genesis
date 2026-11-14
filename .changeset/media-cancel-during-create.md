---
"@marktiderman/genesis-media": patch
---

Cancelling an upload while its create request is in flight now removes the session the create made, once the create has reached the server. The uploader records the upload id it chose as it hands the create to `fetch`, so `cancel()` deletes that session even when the create never answers. When the aborted create rejects, the uploader deletes the id again, because the server may have made the session after `cancel()`'s delete reached it. A 404 there is ignored.

A cancel before the create is sent sends no delete, since the server never saw that id.

One window remains, and the client can't close it: a create that reaches the server after both deletes still makes a session. That session stays open until it expires, so its expiry bounds the window.
