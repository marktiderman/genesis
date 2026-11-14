---
"@marktiderman/genesis-media": patch
---

Cancelling an upload while its create request is in flight no longer leaves a session open on the server. The uploader now records the upload id it chose before sending the create, so `cancel()` deletes that session. When the aborted create rejects, the uploader deletes the id again, because the server may have made the session after `cancel()`'s delete reached it. A 404 there is ignored.
