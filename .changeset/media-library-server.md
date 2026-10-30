---
"@marktiderman/genesis-media-library": minor
---

New package: `@marktiderman/genesis-media-library` (ADR 0012, primitive 4), the server half of resumable, checksummed uploads.

- `/server`: `createUploadHandler({ store, targets, owner, authorize, keyFor, readable?, enqueueVerify? })` serves the upload protocol (create, resume, part, finalize, abort). Every operation is bound to its owner and checked by the app's rules; another owner's upload is 404. Skip-if-identical uses the whole object's SHA-256 and size, within objects the caller can read. Every upload writes only its own storage key. Parts stream through and are reserved before they are written, so a part re-sent with other bytes is 409 `part_conflict` and never reaches the target. Two tabs share one open session. Finalize copies to every target, reads each copy back, and locks it only after it verified. That runs inline up to 64 MiB, otherwise in the `media-library.verify` job (`createUploadVerifyJob`), with 202 `verifying` meanwhile. One run at a time holds a lease. Abort and `sweepExpiredUploads` remove only what they found, stuck verifications included.
- Session stores: `createSupabaseSessionStore` over migration `0001_genesis_media_library.sql` (row level security on the owner, with a pgTAP test), and `createMemorySessionStore`.
- `/targets`: `createS3Target`, `createR2Target` (a Worker binding) and `createMemoryTarget` (versioned). `createS3Target` uses SigV4 on WebCrypto. It reads back, locks and deletes by version id, sets Object Lock only after verification, and refuses a bucket with a default retention. Copies carry their target's `tier`.
- `.`: the protocol's shapes, the part plan, RFC 9530 `content-digest`, and incremental SHA-256 (`@noble/hashes`, or the runtime's own).
