---
"@marktiderman/genesis-media": minor
---

`/signed`: `createSignedImageUrls(signer, { base, derivatives, items, path?, sign? })` signs every declared derivative (ADR 0012 names: `color/800`, `bw/2400`, `web-1080`, `poster`) of the given items and resolves to an `ImageUrlBuilder` for `responsiveImage`, with `widths` to pass along so each `srcset` width is the derivative's own. Every URL is signed for its own derivative (`mediaScope.file`), hour-aligned by default so `srcset`s cache. It signs and never decides access. Also `finishSizes`, `mediaSrc` and `parseSignedImagePath` (for the handler's `route`).
