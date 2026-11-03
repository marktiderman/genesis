---
"@marktiderman/genesis-core": minor
"@marktiderman/genesis-ui": patch
"@marktiderman/genesis-ui-native": patch
---

The justified gallery layout has one home: `@marktiderman/genesis-core/gallery` exports `GalleryItem`, `GALLERY_DEFAULTS`, `GalleryTileAspect`, `justifyRows`, `galleryItemRatio`, `DEFAULT_GALLERY_RATIO` and the `JustifiedRow`/`JustifiedTile` types. genesis-ui and genesis-ui-native re-export them under the same names, so existing imports keep working, and the native copy (with the test that kept it in step) is gone.
