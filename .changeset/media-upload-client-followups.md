---
"@marktiderman/genesis-media": patch
---

Uploads: back-off waits a `Retry-After` on any status it retries (408, 425, 429, 5xx); a
remembered session is kept only on a 401 (an expired token no longer re-sends the whole file) or
a server still down, and any other refusal forgets it and starts fresh; resume keys are stored as
a SHA-256, so IndexedDB never holds the user id or file name; cancelling one worker hash gives
the others to a fresh worker instead of this thread. The handler answers a short part 409
`part_size` (not 503) when the store refuses it, and finalize doesn't queue another verify while
a run holds a live lease. The README lists what's still open under "Known limitations".

Upgrading: resume entries saved by an older client under plain keys (user id and file name) are
never read again, so an upload interrupted before this release starts over once. The IndexedDB
resume store deletes them itself when it opens (it stays at version 1, so tabs still on an
older client are never blocked); there's
nothing to call. A remembered session answered with a 200 that isn't a status (no body, not
JSON) is forgotten and the file goes on a new session, and a worker that refuses a job hands its
files to this thread instead of leaving a cancelled hash unsettled.
