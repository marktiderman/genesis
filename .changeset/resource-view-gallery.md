---
"@marktiderman/genesis-core": minor
"@marktiderman/genesis-ui": minor
"@marktiderman/genesis-ui-native": minor
---

Gallery mode for lists. A view's `gallery` block (`defineView`: `image`, `width`, `height`, `caption`, `alt`, `rowHeight`) makes `mode="grid"` a photo per row in justified rows, in place of cards: ResourceView draws it with GalleryGrid, NativeResourceView with NativeGalleryGrid, and both pack the rows with genesis-core's `justifyRows`. A screen's `gallery` prop overrides the block or adds one. Pressing a photo opens the row as a card does; paging, search, the peek and the table and list views are unchanged, and a screen's own `slots.grid` still wins. `view.galleryItem(row)` gives the row as a `GalleryItem` (an empty `src` when it has no image, drawn as a placeholder), and `galleryProblems` checks a block. A ResourcePage grid slot can opt in to its open handler with a static `opensItems = true`, as the gallery does; other grid slots get exactly what they did before.
