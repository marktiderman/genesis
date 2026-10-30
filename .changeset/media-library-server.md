---
"@marktiderman/genesis-media-library": minor
---

New package: `@marktiderman/genesis-media-library` (ADR 0012, primitive 4), the server half of resumable, checksummed uploads.

- `/server`: `createUploadHandler({ store, targets, owner, authorize, keyFor, readable?, enqueueVerify? })` serves the upload protocol (create, resume, part, finalize, abort). Every operation is bound to its owner and checked by the app's rules; another owner's upload is 404. Skip-if-identical uses the whole object's SHA-256 and size, within objects the caller can read. A part re-sent with other bytes is 409 `part_conflict`. Finalize copies to every target, reads each copy back, and locks it only after it verified: inline up to 64 MiB, otherwise in the `media-library.verify` job (`createUploadVerifyJob`), with 202 `verifying` meanwhile. `sweepExpiredUploads` aborts lapsed sessions.
- Session stores: `createSupabaseSessionStore` over migration `0001_genesis_media_library.sql` (row level security on the owner, with a pgTAP test), and `createMemorySessionStore`.
- `/targets`: `createS3Target` (SigV4 on WebCrypto, Object Lock after verification), `createR2Target` (a Worker binding) and `createMemoryTarget`.
- `.`: the protocol's shapes, the part plan, RFC 9530 `content-digest`, and incremental SHA-256 (`@noble/hashes`, or the runtime's own).
