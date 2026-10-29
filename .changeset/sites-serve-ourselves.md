---
"@marktiderman/genesis-sites": minor
---

Published sites load every font, style and script from the site itself.

- Fonts are self-hosted. Each font choice is served from `/_gs/` as latin woff2 files (the weights it lists), declared with `@font-face` and `font-display: swap` in the page's inline style, and the heading font is preloaded. Google Fonts is gone from the page and from the Content-Security-Policy (`font-src 'self'`). The files come from `@fontsource/*` at build time; their OFL licences ship in `dist/assets/fonts/LICENSES.txt`. They add about 1.1 MB (base64) to the server bundle, in a chunk loaded only on a font request.
- New font choices: Barlow, Barlow Condensed, Oswald, Roboto Condensed and Bebas Neue. Bebas Neue has one weight, so it is a heading font only: `bodyFont` (and a brand's `fonts.body`) is now `BodyFontChoice`, which leaves it out.
- A new publish check, `asset-host`: an image, file or brand logo that loads from a host other than the site and the store's asset origin is a warning, and an error on a site with `images: "own"`. That site's `img-src` narrows to `'self' data:` plus the store's asset origin. `SiteStore.assetOrigin` names that origin (the Supabase store's is its storage origin), `PublishOptions.assetOrigins` adds more, and `checkPost` takes the same options as a third argument. Sites without `images: "own"` keep `img-src 'self' https: data:`.

Breaking, for code that used them: `googleFontHref` and the `fontHref` renderer prop are removed, `FontInfo.google` is replaced by `id`, `family` and `weights`, and the handler's `fonts` option is now a boolean (`false` loads no font files).
