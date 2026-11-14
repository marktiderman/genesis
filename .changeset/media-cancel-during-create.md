---
"@marktiderman/genesis-media": minor
---

This changes how cancel behaves on an existing API, which is a minor change while the package is 0.x.

Cancelling an upload while its create request is in flight now removes the session the create made, once the create has reached the server. The uploader records the upload id it chose as it hands the create to `fetch`, so `cancel()` deletes that session even when the create never answers. When the aborted create rejects, the uploader deletes the id again, because the server may have made the session after `cancel()`'s delete reached it. A 404 there is ignored.

A cancel before the create is sent sends no delete, since the server never saw that id.

One window remains, and the client can't close it: a create that reaches the server after both deletes still makes a session. That session stays open until it expires, so its expiry bounds the window.

The deletes a cancel sends are now best effort: one try, with no back-off, and a deadline. Before, each used the full retry policy, so offline, `await handle.cancel()` and the cancelled `done` took about 15 to 30 seconds to settle. Now each delete gets one try and waits at most the new `cleanupTimeoutMs` option (default 5000 ms). The deadline covers making the headers, the request and reading the answer, so a delete that never answers can't hold `cancel()`, the cancelled `done` or the upload's queue slot. Upload requests keep their retries.

Being best effort cuts both ways. A delete that fails is not retried, whether the network is down, the delete answers 5xx or 429, or the deadline passes. The session then stays open, with whatever parts it received, until it expires: `sessionTtlSeconds` after its last part (7 days by default). After that, `sweepExpiredUploads` (the `media.sweep` job) clears the session and its parts, but only if the app schedules that job.
