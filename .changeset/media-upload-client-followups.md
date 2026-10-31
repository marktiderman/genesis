---
"@marktiderman/genesis-media": patch
---

Uploads: back-off waits a `Retry-After` on a 429 or 503; a remembered session is forgotten only on
a 404 or 410 (an expired token no longer re-sends the whole file); resume keys are stored as a
SHA-256, so IndexedDB never holds the user id or file name (resume entries saved under the old
key aren't found, so an upload interrupted before this release starts over once); cancelling one worker hash gives the
others to a fresh worker instead of this thread. The handler answers a short part 409 `part_size`
(not 503) when the store refuses it, and finalize doesn't queue another verify while a run holds a
live lease. The README lists what's still open under "Known limitations".
