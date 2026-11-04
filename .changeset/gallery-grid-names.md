---
"@marktiderman/genesis-ui": minor
"@marktiderman/genesis-ui-native": minor
---

`GalleryGrid` and `NativeGalleryGrid` take ResourceView's names: `loadMore` (was `onNearEnd`) and `groupBy` (was `getGroup`). The old names still work and are deprecated.

An item with no image (`src: ""`) draws a neutral 4:3 tile showing its `alt` and `caption`, instead of an empty picture. It stays clickable and selectable, and its accessible name is unchanged. ResourceView's gallery grid uses this for records without an image.
