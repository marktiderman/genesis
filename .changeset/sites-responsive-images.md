---
"@marktiderman/genesis-sites": minor
---

Responsive images through genesis-media. `handleSiteRequest` and `SiteRenderer` take `imageUrl` (an `ImageUrlBuilder`, such as `supabaseImageUrl({ url })`); with it every section image gets a `srcset` no wider than the file and `sizes` for its layout (capped at the 1280px column). The default is pass-through, so images load from the same URLs as before; `sizes` is now sent only with a `srcset`. Only the page's first large image (a hero, a post cover, a half-width photo) loads eagerly at high priority; every other image loads lazily, and the header logo loads at once at normal priority. `RenderContext.media` carries the builder and that claim. `Image` takes an optional `phone` crop (shown under 640px through `<picture>`, with its own focal point) and `placeholder` (a small base64 data URI, shown while the image loads). `/import`'s guard, fetch and sniffer now come from `@marktiderman/genesis-media/server`; its exports are unchanged.
