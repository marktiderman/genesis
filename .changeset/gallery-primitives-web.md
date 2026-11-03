---
"@marktiderman/genesis-ui": minor
---

Gallery primitives in the patterns tier, with the same props and defaults as their native twins (`GALLERY_DEFAULTS`):

- **`GalleryGrid`:** justified rows or a fixed-column grid. Grid tiles are square by default; `aspectRatio` sets a ratio, or `"item"` uses each photo's own. Off-screen rows skip layout.
- **`GalleryCard`:** a cover with overlaid badges and actions. A clickable card is named by its title and described by its subtitle and badges.
- **`Lightbox`:** a full-screen viewer with prev/next, a counter, a caption and keyboard control.
  - `renderMedia(item, index)` replaces a picture with a video or a compare view.
  - A picture with no `alt` is named by its position.
  - At an end, focus moves to the other arrow.
  - `labels` changes its words.
- **`LiveIndicator`:** a pulsing live pill.
- **`Rating`:** read-only, or chosen on Radix's `RadioGroup`; re-clicking the chosen star clears it.

Features: media-gallery, rating
