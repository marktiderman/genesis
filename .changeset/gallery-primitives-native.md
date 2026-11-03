---
"@marktiderman/genesis-ui-native": minor
---

The gallery primitives on the phone, with the web's props and defaults:

- **`NativeGalleryGrid`:** `onItemPress`, as `NativeResourcePage` pairs with the web's `onItemClick`. The rows are a virtualized list with `header` and `footer`, and `onNearEnd` fires as scrolling nears the end.
- **`NativeLightbox`:** the one photo viewer.
  - Pinch or double-tap to zoom; paging is off while zoomed.
  - Pull down to close, with the backdrop fading.
  - Tap to show or hide the top bar and caption.
  - An adjustable pager for VoiceOver and TalkBack.
  - `renderMedia` for videos, and `labels`.
  - The gestures move here from genesis-chat's viewer (`NativeZoomablePhoto` and the `lightbox*` helpers).
- **`NativeGalleryCard`, `NativeLiveIndicator`, `NativeRating`.**
- **Icon names:** clapperboard, folder-plus, maximize, settings-2, aperture, radio and star.

Features: media-gallery, rating
