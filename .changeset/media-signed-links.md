---
"@marktiderman/genesis-media": patch
---

New subpath `@marktiderman/genesis-media/signed` (server and edge only; it resolves to nothing for browser bundles): signed links to private media and streaming ZIP bundles, on fetch and WebCrypto (Node 20+ and Workers).

- `createMediaSigner({ secret | keys: { current, secrets }, ttl?, align?, now? })` with `sign`, `verify` and `signMediaUrl`. Tokens carry a format version (`v1.`) and, with `keys`, a key id (`k`), so secrets rotate and the format can change without breaking links in flight. TTL from one minute to 30 days, per scope kind or per call, optionally hour-aligned.
- `mediaScope.item`, `.file`, `.download` (the filename bound in) and `.bundle`.
- `createSignedMediaHandler({ storage, signer, route, cacheControl?, onError? })`: HEAD, single byte ranges (206 and 416) with `If-Range` against the ETag, RFC 6266 `content-disposition`, `x-robots-tag: noindex` and `nosniff`. Every response but a PDF carries `content-security-policy: sandbox; default-src 'none'`, and only images other than SVG, video, audio and PDF are shown inline; anything else is an attachment. A bad or expired link and a path `route` doesn't know get the same 403, checked before storage is read; only a valid link to a missing file is 404. `onError` sees an error `route` threw.
- `createZipManifest({ filename, entries: [{ key, path, size? }], expiresAt })` and `createBundleHandler`: a store-only ZIP streamed one file at a time, ZIP64 past 4 GB, at most 65,535 files, with the manifest's own filename and expiry.
- The `MediaStorage` interface (`head`, `get` with a range) and `createMemoryStorage` for tests.

Adds `client-zip` (pinned at 2.5.1) as a dependency, imported only by `/signed`.
