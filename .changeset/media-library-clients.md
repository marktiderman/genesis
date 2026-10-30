---
"@marktiderman/genesis-media-library": minor
---

genesis-media-library's clients, and adapters that plug it into forms and chat through their upload ports.

- `@marktiderman/genesis-media-library/client`: `createUploader` drives the resumable protocol from a browser, React Native or Node, all from one core.
  - It hashes the whole file first (in a Web Worker in browsers, `@noble/hashes` elsewhere, or your own `hash`), or with `hashFirst: false` hashes while it sends.
  - It resumes from the server's part list (`createIndexedDbResumeStore` survives a reload), sends parts in parallel, restarts once on `part_conflict`, and polls a big upload's read-back.
  - Priority, pause and resume, files and parts at once, and a speed cap are client configuration.
  - Sources are `fromBlob`, `fromFileHandle` and `fromBytes`.
  - `createSupabaseTusTransport` is Supabase Storage's TUS endpoint.
  - Remembered uploads are keyed by endpoint, `ownerHint`, purpose and file, and lapse with their session; `clearResume()` forgets them at sign-out.
  - A remembered session is resumed only if its targets and SHA-256 still match.
  - `cancel()` and `signal` stop requests in flight and back-off waits; a session whose file changed (`identity_mismatch`) is aborted and the upload starts again.
  - A create carries a client-chosen `uploadId`, so a retried create finds its session.
  - The browser build hashes in a standalone `hash-worker.js` (started with a literal `new Worker(new URL(…))`, so Vite and webpack bundle it), falls back to the main thread if the worker goes silent, and terminates it on cancel.
  - The speed cap is paced by bytes; back-off has jitter.
- `/client` takes a `randomId` for runtimes without `crypto.getRandomValues` (Hermes without a polyfill), and says so plainly when there is neither; base64 no longer needs `btoa`. The speed cap holds with several parts in flight.
- `@marktiderman/genesis-media-library/forms`: `createFormsUploadAdapter({ uploader })`, an object that fits genesis-forms' `UploadAdapter`, so `<Form uploads={…}>` sends a form's files through the resumable protocol.
- `@marktiderman/genesis-media-library/chat`: `createChatTusTransport({ supabaseUrl })`, an object that fits `createTusUpload`'s `transport`.
- Neither forms nor chat depends on this package: an app opts in by passing the adapter.
