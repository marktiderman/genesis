---
"@marktiderman/genesis-media": minor
---

Resumable, checksummed uploads (ADR 0012, primitive 4), under `@marktiderman/genesis-media/uploads`, beside the media value. genesis-media is now optional (`genesis.optional: true`): an upgrade apps opt into, which no primitive imports.

- `/uploads/server`: `createUploadHandler({ store, targets, owner, authorize, keyFor, readable?, enqueueVerify? })` serves the upload protocol (create, resume, part, finalize, abort).
  - Every operation is bound to its owner and checked by the app's rules; another owner's upload is 404.
  - Skip-if-identical uses the whole object's SHA-256 and size, within objects the caller can read.
  - Every upload writes only its own storage key.
  - Parts stream through and are reserved before they are written, so a part re-sent with other bytes is 409 `part_conflict` and never reaches the target. A reservation belongs to the one request that made it: another request for that part meanwhile writes nothing and gets 503 (send it again), and one left for `partReserveSeconds` (10 minutes) is taken over.
  - Two tabs share one open session.
  - Finalize moves the session out of `open` before anything is assembled, so an abort racing it never leaves an object behind; then it assembles, copies to every target, reads each copy back, and locks it only after it verified. That runs inline up to 64 MiB, otherwise in the `media.verify` job (`createUploadVerifyJob`), with 202 `verifying` meanwhile. One run at a time holds a lease.
  - A finalize that loses the race to another answers 202 while the upload is checked. Abort works on a finalized upload nothing has assembled yet. Each verified copy is recorded once it is locked, and a target's earlier copy that didn't verify is removed, by its version, before a retry.
  - Abort and `sweepExpiredUploads` remove only what they found, stuck verifications included.
  - Session stores: `createSupabaseSessionStore` over the package's migration `0001_genesis_media.sql` (row level security on the owner, with a pgTAP test), and `createMemorySessionStore`.
- `/uploads/targets`: `createS3Target`, `createR2Target` (a Worker binding; after a lost `finish` it finds the upload's own assembly at its unique key) and `createMemoryTarget` (versioned). `createS3Target` uses SigV4 on WebCrypto, reads back, locks and deletes by version id, sets Object Lock only after verification, refuses a bucket with a default retention, and sends `Content-MD5` with `PutObjectRetention` for stores that ask for it. Copies carry their target's `tier`.
- `/uploads/client`: `createUploader` drives the protocol from a browser, React Native or Node, from one core.
  - It hashes the whole file first (in a Web Worker in browsers, `@noble/hashes` elsewhere, or your own `hash`), or with `hashFirst: false` while it sends. The browser build's `hash-worker.js` is a standalone file started with a literal `new Worker(new URL(…))`, so Vite and webpack bundle it; it falls back to the main thread if the worker goes silent.
  - It resumes from the server's part list (`createIndexedDbResumeStore` survives a reload), sends parts in parallel, restarts once on `part_conflict` or `identity_mismatch`, and polls a big upload's read-back. A remembered session is resumed only if its targets and SHA-256 still match; entries are keyed by endpoint, `ownerHint`, purpose and file, lapse with their session, and `clearResume()` forgets them.
  - Priority, pause and resume, files and parts at once, and a speed cap (paced by bytes, held with several parts in flight) are client configuration; `cancel()` and `signal` stop requests in flight and waits.
  - A create carries a client-chosen `uploadId` (`randomId` for runtimes without `crypto.getRandomValues`, with a plain error when there is neither), and base64 doesn't need `btoa`.
  - Sources are `fromBlob`, `fromFileHandle` and `fromBytes`; `createSupabaseTusTransport` is Supabase Storage's TUS endpoint.
- `/uploads/client/browser`: the browser build with its own types (`createBrowserFileHasher`).
- `/uploads`: the protocol's shapes, the part plan, RFC 9530 `content-digest`, and incremental SHA-256.
- `/forms`: `createFormsUploadAdapter({ uploader })`, an object that fits genesis-forms' `UploadAdapter`, so `<Form uploads={…}>` sends a form's files through the protocol. forms doesn't depend on this package.
- `genesis` metadata for the package layering check: `layer: "primitive"`, `group: "data"`, `owner: "@marktiderman"`, `optional: true`.
