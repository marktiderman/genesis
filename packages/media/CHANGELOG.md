# @marktiderman/genesis-media

## 0.1.1

### Patch Changes

- 176bb8b: New package: `@marktiderman/genesis-media`. `ImageValue` (alt or decorative, size, focal point, a phone crop, a blur placeholder); `responsiveImage(value, { imageUrl, sizes, widths, priority, eager })`, which returns `src`, `srcset`, `sizes`, the size, `loading`, `fetchpriority`, `decoding`, `objectPosition` and the phone crop's source; the `ImageUrlBuilder` contract with `supabaseImageUrl` (Supabase Storage transforms) and `passThroughImageUrl`; `sniff`. `/server` holds the fetch guarded against server-side request forgery (`fetchGuarded`, `FetchRefusedError`, `urlProblems`, `isPublicAddress`, `guardedLookup`, `createGuardedTransport`), moved from genesis-sites.
- 60f8f0d: `createSignedMediaHandler`: an `onError` hook that throws (or returns a promise that rejects) no longer turns the request into a 500; the answer stays the same 403 as no route.
- 222df94: `/signed`: `createSignedImageUrls(signer, { base, derivatives, items, maxItems?, path?, sign? })` signs every declared derivative (ADR 0012 names: `color/800`, `bw/2400`, `web-1080`, `poster`) of the given items and resolves to an `ImageUrlBuilder` for `responsiveImage`. Every URL is signed for its own derivative (`mediaScope.file`), hour-aligned by default (`sign` is laid over that default, so `{ ttl: "3h" }` stays aligned) so `srcset`s cache. It signs and never decides access. The builder carries the derivative `widths`, which `responsiveImage` uses in place of its `widths` option, so each `srcset` `w` is the derivative's own and an original narrower than the widest derivative is never labelled with its own width; and `expires`, the earliest link expiry, to cap the HTML's `cache-control` or ISR `revalidate` below. One call signs at most `maxItems` items (default `DEFAULT_MAX_SIGNED_ITEMS`, 1,000): sign one page at a time. Two derivatives at one width, and a derivative named `original`, are refused. `mediaSrc` refuses ids the handler would refuse (a slash, backslash, NUL or percent-escape) instead of signing links that are always 403. Also `finishSizes` and `parseSignedImagePath` (for the handler's `route`).

  `ImageUrlBuilder` may carry `widths`: a builder of fixed files (signed derivatives) whose widths `responsiveImage` offers as they are, and `srcsetWidths` takes `{ fixed: true }` for that.

- c9b2640: New subpath `@marktiderman/genesis-media/signed` (server and edge only; it resolves to nothing for browser bundles): signed links to private media and streaming ZIP bundles, on fetch and WebCrypto (Node 20+ and Workers).

  - `createMediaSigner({ secret | keys: { current, secrets }, ttl?, align?, now? })` with `sign`, `verify` and `signMediaUrl`. Tokens carry a format version (`v1.`) and, with `keys`, a key id (`k`), so secrets rotate and the format can change without breaking links in flight. TTL from one minute to 30 days, per scope kind or per call, optionally hour-aligned.
  - `mediaScope.item`, `.file`, `.download` (the filename bound in) and `.bundle`.
  - `createSignedMediaHandler({ storage, signer, route, cacheControl?, onError? })`: HEAD, single byte ranges (206 and 416) with `If-Range` against the ETag, RFC 6266 `content-disposition`, `x-robots-tag: noindex` and `nosniff`. Every response but a PDF carries `content-security-policy: sandbox; default-src 'none'`, and only images other than SVG, video, audio and PDF are shown inline; anything else is an attachment. A bad or expired link and a path `route` doesn't know get the same 403, checked before storage is read; only a valid link to a missing file is 404. `onError` sees an error `route` threw.
  - `createZipManifest({ filename, entries: [{ key, path, size? }], expiresAt })` and `createBundleHandler`: a store-only ZIP streamed one file at a time, ZIP64 past 4 GB, at most 65,535 files, with the manifest's own filename and expiry.
  - The `MediaStorage` interface (`head`, `get` with a range) and `createMemoryStorage` for tests.

  Adds `client-zip` (pinned at 2.5.1) as a dependency, imported only by `/signed`.

- 4240f39: Resumable, checksummed uploads (ADR 0012, primitive 4), under `@marktiderman/genesis-media/uploads`, beside the media value. genesis-media is now optional (`genesis.optional: true`): an upgrade apps opt into, which no primitive imports.

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
