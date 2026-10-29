---
"@marktiderman/genesis-media": minor
---

New subpath `@marktiderman/genesis-media/signed` (server and edge only; it resolves to nothing for browser bundles): signed links to private media and streaming ZIP bundles, on fetch and WebCrypto (Node 20+ and Workers).

- `createMediaSigner({ secret | keys: { current, secrets }, ttl?, align?, now? })` with `sign`, `verify` and `signMediaUrl`. Tokens carry a format version (`v1.`) and, with `keys`, a key id (`k`), so secrets rotate and the format can change without breaking links in flight. TTL from one minute to 30 days, per scope kind or per call, optionally hour-aligned.
- `mediaScope.item`, `.file`, `.download` (the filename bound in) and `.bundle`.
- `createSignedMediaHandler({ storage, signer, route, cacheControl? })`: HEAD, single byte ranges (206 and 416), RFC 6266 `content-disposition`, `x-robots-tag: noindex`; 403 for a bad or expired link (checked before storage is read), 404 for a missing file.
- `createZipManifest({ filename, entries: [{ key, path, size? }], expiresAt })` and `createBundleHandler`: a store-only ZIP streamed one file at a time, ZIP64 past 4 GB, at most 65,535 files, with the manifest's own filename and expiry.
- The `MediaStorage` interface (`head`, `get` with a range) and `createMemoryStorage` for tests.

Adds `client-zip` (pinned at 2.5.1) as a dependency, imported only by `/signed`.
