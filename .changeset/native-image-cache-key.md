---
"@marktiderman/genesis-ui-native": minor
"@marktiderman/genesis-core": minor
---

`NativeImage` takes a `cacheKey`: with expo-image it caches the picture under that key instead of its URL (`source={{ uri, cacheKey }}`), so a signed URL that rotates (a new expiry or signature for the same file) still hits the memory and disk cache instead of downloading the picture again. `recyclingKey` now defaults to `cacheKey`, then `src`, so a rotated URL for the same picture doesn't reset the view. React Native's `Image` fallback ignores it, as it does `placeholder` and `priority`. `GalleryItem` gains an optional `cacheKey`, which `NativeGalleryGrid` and `NativeLightbox` pass to their images; the web grid ignores it. `GenesisImageProps.source` accepts `{ uri, cacheKey }`.
