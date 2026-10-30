---
"@marktiderman/genesis-media-library": minor
"@marktiderman/genesis-chat": minor
"@marktiderman/genesis-forms": minor
"@marktiderman/genesis-forms-web": patch
---

genesis-media-library's clients, and forms' and chat's uploads folded into it.

- `@marktiderman/genesis-media-library/client`: `createUploader` drives the resumable protocol from a browser, React Native or Node, all from one core.
  - It hashes the whole file first (in a Web Worker in browsers, `@noble/hashes` elsewhere, or your own `hash`), or with `hashFirst: false` hashes while it sends.
  - It resumes from the server's part list (`createIndexedDbResumeStore` survives a reload), sends parts in parallel, restarts once on `part_conflict`, and polls a big upload's read-back.
  - Priority, pause and resume, files and parts at once, and a speed cap are client configuration.
  - Sources are `fromBlob`, `fromFileHandle` and `fromBytes`.
  - `createSupabaseTusTransport` is Supabase Storage's TUS endpoint, moved here from genesis-chat.
  - Remembered uploads are keyed by endpoint, `ownerHint`, purpose and file, and lapse with their session; `clearResume()` forgets them at sign-out.
  - A remembered session is resumed only if its targets and SHA-256 still match.
  - `cancel()` and `signal` stop requests in flight and back-off waits; a session whose file changed (`identity_mismatch`) is aborted and the upload starts again.
  - A create carries a client-chosen `uploadId`, so a retried create finds its session.
  - The browser build hashes in a standalone `hash-worker.js` (started with a literal `new Worker(new URL(…))`, so Vite and webpack bundle it), falls back to the main thread if the worker goes silent, and terminates it on cancel.
  - The speed cap is paced by bytes; back-off has jitter.
- `@marktiderman/genesis-media-library/compat`: the signed single-upload JSON genesis-forms has used.
- genesis-forms: `UploadRequest`, `SignedUpload`, `UploadGrant` and `UploadRefusal` are now deprecated type re-exports from media-library's `/compat`, and `MAX_UPLOAD_REQUEST_BYTES` is deprecated. `createUploadHandler` is deprecated in favour of media-library's handler, with unchanged behaviour. forms now depends on genesis-media-library for these types; the engine still loads nothing else at run time.
- genesis-forms-web: `signedUploadHost` is deprecated in favour of media-library's `createUploader`, with unchanged behaviour.
- genesis-chat: `createTusUpload` keeps its API and guarantees, now on media-library's `createSupabaseTusTransport`, and is deprecated. `TUS_CHUNK_BYTES` and `base64Utf8` are re-exported from there. chat now depends on genesis-media-library.
