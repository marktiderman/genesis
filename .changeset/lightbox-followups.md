---
"@marktiderman/genesis-ui-native": patch
---

`NativeLightbox` and `NativeGalleryGrid` follow-ups:

- With `renderMedia`, the pages are no longer one VoiceOver element, so controls inside them (a video player's) can be reached. The counter in the top bar is the adjustable pager instead.
- `zoomable={false}` turns zoom off while pull-down-to-close stays on. `NativeZoomablePhoto` takes `zoomable`.
- When a parent doesn't take the page a swipe asks for, the pager scrolls back to `index`.
- `NativeGalleryGrid`'s docs say not to nest it in a ScrollView; put content in `header` and `footer` instead.
