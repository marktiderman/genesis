---
"@marktiderman/genesis-chat": minor
---

Chat's photos open in the gallery's viewer, so there's one photo viewer across the app.

- On the phone, `ChatPhotoViewer` (and `ChatMediaViewer`) is genesis-ui-native's `NativeLightbox`: pinch and double-tap zoom, pull down to close, an adjustable pager for VoiceOver and TalkBack. It keeps chat's words and its Save and Share buttons. Its props are unchanged. The counter reads "2 / 3" (the pager still says "Photo 2 of 3"), and some inner test IDs follow NativeLightbox's: `-pager-a11y` and `-photo-<key>`.
- On the web, a message's photos open in genesis-ui's `Lightbox`.
- Deprecated, removed in a later minor: the web `Lightbox` export, and the native gesture helpers `shouldDismiss`, `pinchScale`, `panLimit`, `DISMISS_DISTANCE`, `DISMISS_VELOCITY` and `MAX_ZOOM`. Use `Lightbox` from `@marktiderman/genesis-ui`, and the `lightbox*` helpers and `LIGHTBOX_*` constants from `@marktiderman/genesis-ui-native/components`.
- Needs genesis-ui 2.31 and genesis-ui-native 3.6, the releases with the gallery.
